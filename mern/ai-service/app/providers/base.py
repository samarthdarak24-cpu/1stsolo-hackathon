"""
Base class + registry for every model provider.

Why this exists
---------------
A hackathon machine (and most laptops) will not have all of YOLO26, SigLIP2,
BGE-M3, BGE-reranker and PaddleOCR installed, let alone a GPU. Rather than
pretending otherwise, each provider:

  1. loads its model lazily on first use (so startup is instant),
  2. loads INDEPENDENTLY of every other provider,
  3. reports its own status honestly via ``info()``,
  4. raises ``ProviderUnavailable`` so the pipeline can degrade that one
     signal and keep the rest.

The orchestrators in ``app/core`` ask ``get_provider(...)`` for what they
need and read ``.available`` before using it. They never assume presence.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Any, Callable, Optional, Protocol, runtime_checkable

log = logging.getLogger("lostlink.providers")


class ProviderUnavailable(RuntimeError):
    """Raised when a provider cannot serve a request.

    Callers catch this and degrade the corresponding signal rather than
    failing the whole pipeline.
    """


@runtime_checkable
class Provider(Protocol):
    """Structural interface every provider implements."""

    name: str

    def available(self) -> bool: ...

    def info(self) -> dict[str, Any]: ...

    def close(self) -> None: ...


class LazyProvider:
    """Template for a single model.

    Subclasses implement ``_load()`` and whatever inference methods they need.
    The base class handles lazy init, thread-safety (inference is serialised
    per provider because model forwards are not re-entrant on CPU), status
    reporting and timing.
    """

    name: str = "provider"

    def __init__(self) -> None:
        self._model: Any = None
        self._state: str = "not_loaded"  # not_loaded | loading | ready | unavailable
        self._detail: Optional[str] = None
        self._load_seconds: Optional[float] = None
        self._lock = threading.Lock()
        self._infer_lock = threading.Lock()

    # -- to implement ------------------------------------------------------
    def _load(self) -> Any:  # pragma: no cover - abstract
        raise NotImplementedError

    # -- lifecycle ---------------------------------------------------------
    def load(self) -> bool:
        """Load the model once. Returns True when ready.

        Never raises: a failure is recorded as ``unavailable`` with a reason
        so ``/health`` can explain exactly what went wrong.
        """
        if self._state == "ready":
            return True
        if self._state == "unavailable":
            return False
        with self._lock:
            if self._state == "ready":
                return True
            if self._state == "unavailable":
                return False
            self._state = "loading"
            started = time.perf_counter()
            try:
                self._model = self._load()
                self._load_seconds = round(time.perf_counter() - started, 2)
                self._state = "ready"
                self._detail = None
                log.info("provider %s ready in %.2fs", self.name, self._load_seconds)
                return True
            except Exception as exc:  # noqa: BLE001 - we report, never crash
                self._model = None
                self._state = "unavailable"
                self._detail = f"{type(exc).__name__}: {exc}"
                log.warning("provider %s unavailable: %s", self.name, self._detail)
                return False

    def available(self) -> bool:
        if self._state in ("ready", "unavailable"):
            return self._state == "ready"
        return self.load()

    def is_configured(self) -> bool:
        """Whether this provider's external dependency is configured at all.

        Overridden by providers that need a URL or credentials (the VLM needs
        ``VLM_BASE_URL``). It exists so health can tell "you have not set this
        up, which is allowed" apart from "this is broken": an intentionally
        absent optional model must not paint the whole service degraded.
        """
        return True

    def is_ready(self) -> bool:
        """Non-loading readiness peek, for reporting and introspection paths.

        ``available()`` deliberately loads the model, because every inference
        call site uses it as "get it ready and tell me if I can proceed". That
        makes it the wrong tool for building a status string: reporting the
        pipeline version must never cost seconds of model loading. Use this
        where you only want to know what has already happened.
        """
        return self._state == "ready"

    def require(self) -> Any:
        """Return the loaded model or raise ``ProviderUnavailable``."""
        if not self.load():
            raise ProviderUnavailable(f"{self.name} is unavailable: {self._detail}")
        return self._model

    def info(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "status": self._state if self._state != "not_loaded" else "ready",
            "model": getattr(self, "model_id", None),
            "detail": self._detail,
            "load_seconds": self._load_seconds,
        }

    def infer(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        """Run an inference call under the provider's serialisation lock."""
        self.require()
        with self._infer_lock:
            return fn(self._model, *args, **kwargs)

    def close(self) -> None:
        with self._lock:
            self._model = None
            self._state = "not_loaded"
            self._detail = None


# --------------------------------------------------------------------------
# registry
# --------------------------------------------------------------------------
_REGISTRY: dict[str, LazyProvider] = {}
_REGISTRY_LOCK = threading.Lock()


def register(provider: LazyProvider) -> LazyProvider:
    with _REGISTRY_LOCK:
        _REGISTRY[provider.name] = provider
    return provider


def get_provider(name: str) -> Optional[LazyProvider]:
    return _REGISTRY.get(name)


def all_providers() -> dict[str, LazyProvider]:
    return dict(_REGISTRY)


def health_snapshot() -> dict[str, dict[str, Any]]:
    """Provider status WITHOUT triggering a load.

    ``/health`` must stay fast, so we never load a model here. A provider that
    has never been touched is reported as ``"lazy"`` rather than ``"ready"`` -
    claiming readiness we have not verified would make the health endpoint lie,
    which is the one thing it must never do.
    """
    out: dict[str, dict[str, Any]] = {}
    for name, provider in _REGISTRY.items():
        info = provider.info()
        if info["status"] == "ready" and provider._state == "not_loaded":
            info["status"] = "lazy"
            info["detail"] = "Not loaded yet - first request will load it"
        # "It failed" and "it was never switched on" are different facts. A
        # provider whose dependency is simply unset is reported as
        # ``not_configured`` so callers can stop treating it as damage.
        if info["status"] == "unavailable" and not provider.is_configured():
            info["status"] = "not_configured"
        info["optional"] = not provider.is_configured() or getattr(provider, "optional", False)
        out[name] = info
    return out


def warm_all() -> dict[str, bool]:
    """Optional startup warm-up. Used by the CLI, not by app startup."""
    return {name: provider.load() for name, provider in _REGISTRY.items()}
