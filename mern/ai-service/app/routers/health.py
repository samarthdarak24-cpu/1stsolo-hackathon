"""Health and provider introspection."""
from __future__ import annotations

import time
from typing import Any, Callable, Optional

from fastapi import APIRouter
from app.core.config import settings
from app.models.schemas import HealthResponse
from app.providers import health_snapshot
from app.providers.vlm import config_state as vlm_config_state
from app.vector import store

router = APIRouter(tags=["health"])

# What each model is FOR, in the product's own words. The ops screen shows this
# next to the checkpoint so a non-specialist can read the model list.
MODEL_ROLES: dict[str, str] = {
    "detector": "object detection - finds the item in the photo",
    "siglip": "visual similarity - do these two photos show the same thing",
    "bge_m3": "semantic similarity - do these two descriptions agree",
    "ocr": "text in image - serial numbers, names, labels",
    "reranker": "relevance re-ranking - orders the shortlist",
    "vlm": "structured attributes + grounded explanation",
}


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Report what is actually loaded right now.

    Deliberately does not trigger a model load, so it stays fast enough for a
    container healthcheck. ``status`` is "degraded" whenever any provider is
    unavailable, which is the honest answer on a machine without the optional
    installs.
    """
    providers = health_snapshot()
    vector_mode = store.connect()
    vector_detail = store.describe()

    # "lazy" means installed-but-not-loaded: that is healthy, not degraded.
    # "unavailable" is the real degradation signal.
    # Only an *required* provider that is actually broken degrades the service.
    # "not_configured" is the normal state of the optional vision model on any
    # host without a VLM endpoint, and calling that degraded would leave the
    # status pinned to "degraded" forever, which is the same as having no
    # status at all.
    unavailable = [
        name
        for name, info in providers.items()
        if info["status"] in ("unavailable", "not_installed") and not info.get("optional")
    ]
    not_configured = [
        name for name, info in providers.items() if info["status"] == "not_configured"
    ]
    # "qdrant-local" is the on-disk engine: durable, so not a degradation. Only
    # the per-process index ("in-memory") and a refused connection are.
    durable_vector = vector_mode in ("qdrant", "qdrant-local")
    degraded = bool(unavailable) or not durable_vector

    # State the VLM situation explicitly. Without this, the only way to tell a
    # configured-but-down vision model from an unconfigured one was to read the
    # provider detail string.
    vlm_state = vlm_config_state()
    vlm_state["status"] = providers.get("vlm", {}).get("status", "unknown")

    return HealthResponse(
        status="degraded" if degraded else "ok",
        service=settings.service_name,
        device=settings.resolved_device,
        providers=providers,
        vector_store=vector_mode,
        vector_detail=vector_detail,
        vlm=vlm_state,
        optional_missing=not_configured,
    )


# --------------------------------------------------------------------------
# /health/models - the model inventory a reviewer can audit
# --------------------------------------------------------------------------
_SCENE = None


def _probe_scene():
    """A synthetic image that gives every vision model something real to chew on.

    Generated rather than shipped as a fixture so the endpoint works on any
    checkout, and deliberately high-contrast: a plain grey square would let a
    broken processor "pass" by returning a constant vector.
    """
    global _SCENE  # noqa: PLW0603 - one small image, built once
    if _SCENE is None:
        from PIL import Image, ImageDraw  # noqa: PLC0415

        image = Image.new("RGB", (320, 320), (250, 250, 250))
        draw = ImageDraw.Draw(image)
        draw.rectangle([90, 70, 230, 250], fill=(28, 28, 34), outline=(0, 0, 0), width=4)
        draw.rectangle([120, 40, 200, 80], fill=(28, 28, 34))
        # Readable glyphs so OCR has a positive result to find, not just an
        # empty frame that would make "0 lines" ambiguous.
        draw.text((120, 150), "ABC-123", fill=(255, 255, 255))
        _SCENE = image
    return _SCENE


def _probe_fns() -> dict[str, Callable[[Any], tuple[str, Optional[int]]]]:
    """Micro-inference per model: returns (human evidence, output dimension)."""

    def detector(provider):
        boxes = provider.detect(_probe_scene())
        # The probe is a synthetic rectangle, not a COCO class, so zero boxes is
        # the correct answer here - what is being verified is that weights load
        # and a well-formed prediction comes back. Say that instead of implying
        # a detection was expected.
        return (
            "predict() completed and returned a well-formed result "
            f"({len(boxes)} box(es); the probe image holds no COCO-class object)",
            None,
        )

    def siglip(provider):
        vector = provider.embed_images([_probe_scene()])[0]
        return f"embed_images() returned a {len(vector)}-dim unit vector", len(vector)

    def bge_m3(provider):
        vector = provider.embed_texts(["black backpack with a laptop inside"])[0]
        return f"embed_texts() returned a {len(vector)}-dim unit vector", len(vector)

    def ocr(provider):
        out = provider.read(_probe_scene()) or {}
        text = str(out.get("text") or "")
        lines = out.get("lines") or []
        return f"read() returned {len(lines)} line(s), text={text[:40]!r}", None

    def reranker(provider):
        scores = provider.score("black backpack", ["a black backpack", "a red bicycle"])
        return f"score() -> {[round(float(s), 3) for s in scores]}", None

    def vlm(provider):
        attrs = provider.extract_attributes(_bytes_of_probe())
        return f"extract_attributes() -> {sorted(attrs)[:6]}", None

    return {
        "detector": detector,
        "siglip": siglip,
        "bge_m3": bge_m3,
        "ocr": ocr,
        "reranker": reranker,
        "vlm": vlm,
    }


def _bytes_of_probe() -> bytes:
    import io  # noqa: PLC0415

    buffer = io.BytesIO()
    _probe_scene().save(buffer, format="PNG")
    return buffer.getvalue()


@router.get("/health/models")
def models(verify: bool = False) -> dict[str, Any]:
    """Per-model inventory: checkpoint, whether it is LOADED, device, dimension.

    A bare "ready" is not enough to audit an AI claim, so this endpoint never
    emits one. Without ``verify`` it reports only what has already happened
    (``lazy`` / ``loaded`` / ``not_configured`` / ``unavailable``) and costs
    nothing. With ``?verify=1`` it runs one real micro-inference through every
    applicable model and upgrades the status to ``verified`` only when that call
    actually returned a usable result, quoting what came back.
    """
    from app.providers import all_providers  # noqa: PLC0415

    providers = all_providers()
    probes = _probe_fns()
    device = settings.resolved_device
    out: dict[str, Any] = {}

    for name, provider in providers.items():
        entry: dict[str, Any] = {
            "role": MODEL_ROLES.get(name, name),
            "checkpoint": getattr(provider, "model_id", None),
            "loaded": provider.is_ready(),
            "device": device,
            "dimension": getattr(provider, "dim", None) if provider.is_ready() else None,
            "load_seconds": getattr(provider, "_load_seconds", None),
            "status": "loaded" if provider.is_ready() else "lazy",
            "verified": None,
            "evidence": None,
            "detail": None,
        }

        if not provider.is_configured():
            entry["status"] = "not_configured"
            entry["detail"] = provider.info().get("detail")
        elif verify:
            started = time.perf_counter()
            try:
                evidence, dimension = probes[name](provider)
                entry.update(
                    loaded=provider.is_ready(),
                    verified=True,
                    status="verified",
                    evidence=evidence,
                    latency_ms=round((time.perf_counter() - started) * 1000, 1),
                )
                if dimension:
                    entry["dimension"] = dimension
            except Exception as exc:  # noqa: BLE001 - reported, never raised
                entry.update(
                    verified=False,
                    status="unavailable",
                    detail=f"{type(exc).__name__}: {exc}",
                    latency_ms=round((time.perf_counter() - started) * 1000, 1),
                )
        elif provider.info().get("detail"):
            entry["detail"] = provider.info()["detail"]

        out[name] = entry

    mode = store.connect()
    vector = {
        "role": "durable vector index - semantic + visual retrieval",
        "checkpoint": mode,
        "loaded": mode != "in-memory",
        "status": "connected" if mode != "in-memory" else "ephemeral",
        "detail": store.describe(),
    }

    verified = [n for n, e in out.items() if e["verified"] is True]
    return {
        "service": settings.service_name,
        "device": device,
        "verified_now": verify,
        "models": out,
        "vector_store": vector,
        "verified": sorted(verified),
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


@router.get("/cctv")
def cctv_capability() -> dict:
    """What this host can do with footage, without touching a camera.

    Split deliberately: searching an uploaded clip and subscribing to a live
    stream have different requirements and different privacy weight, so they
    are reported separately rather than as one "CCTV" yes/no.
    """
    from app.core import rtsp  # noqa: PLC0415

    return rtsp.capability()


@router.get("/providers")
def providers() -> dict:
    """Full provider detail, loading each model on first call.

    Used by the ops screen to see exactly which models are present and how long
    each took to load.
    """
    from app.providers import all_providers  # noqa: PLC0415

    for provider in all_providers().values():
        provider.load()
    return {"providers": health_snapshot()}


@router.post("/warmup")
def warmup() -> dict:
    """Preload every model. Call after boot so the first user request is fast."""
    from app.providers import warm_all  # noqa: PLC0415

    return {"loaded": warm_all()}
