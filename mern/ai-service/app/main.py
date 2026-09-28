"""
LostLink AI - inference service.

FastAPI app that owns every ML model, so the Express API never has to carry
torch/transformers on its event loop.

Startup deliberately does NOT load any model. Loading is lazy and per-provider,
so the service is accepting requests within a second of boot and reports its
true capability state on /health. Call POST /warmup in the background if you
want models resident before the first user request.
"""
from __future__ import annotations

import logging
import threading
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import embeddings, health, inference
from app.vector import store

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
)
log = logging.getLogger("lostlink")

app = FastAPI(
    title=settings.service_name,
    version="1.0.0",
    description=(
        "YOLO26n detection, SigLIP2 visual embeddings, BGE-M3 text embeddings, "
        "BGE reranking, PaddleOCR and Qwen3-VL explanations. Every model is "
        "optional: the service degrades signal by signal and reports what it "
        "could not measure."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(embeddings.router)
app.include_router(inference.router)


def _warm_models() -> None:
    """Preload models off the startup path.

    Deliberately a daemon thread: a cold CPU load of YOLO + SigLIP + BGE-M3
    takes tens of seconds, and blocking startup on it would fail the health
    check that supervisors rely on. Failures are logged and reported by
    ``/health`` - a model that cannot load must never stop the service booting.
    """
    from app.providers import all_providers, warm_all  # noqa: PLC0415

    started = time.perf_counter()
    wanted = settings.warmup_provider_list
    try:
        if wanted:
            providers = all_providers()
            loaded: dict[str, bool] = {}
            for name in wanted:
                provider = providers.get(name)
                if provider is None:
                    log.warning("warmup: unknown provider '%s' - skipping", name)
                    continue
                loaded[name] = provider.load()
        else:
            loaded = warm_all()
        ready = [n for n, ok in loaded.items() if ok]
        failed = [n for n, ok in loaded.items() if not ok]
        log.info(
            "warmup finished in %.1fs - ready=%s%s",
            time.perf_counter() - started,
            ready or "none",
            f" unavailable={failed}" if failed else "",
        )
    except Exception as exc:  # noqa: BLE001 - boot must survive a warmup bug
        log.warning("warmup failed after %.1fs: %s", time.perf_counter() - started, exc)


@app.on_event("startup")
def on_startup() -> None:
    started = time.perf_counter()
    mode = store.connect()
    log.info("%s ready on port %s (device=%s, vector=%s, boot=%.2fs)",
             settings.service_name, settings.port, settings.resolved_device,
             mode, time.perf_counter() - started)
    log.info(
        "Models load lazily. GET /health shows live capability; POST /warmup "
        "preloads them."
    )
    if settings.warmup_on_boot:
        threading.Thread(target=_warm_models, name="model-warmup", daemon=True).start()
        log.info("warmup_on_boot is set - preloading models in the background.")


@app.get("/")
def root() -> dict:
    return {
        "service": settings.service_name,
        "docs": "/docs",
        "health": "/health",
        "note": "Inference only. Business data and auth live in the Node API.",
    }
