"""Provider package: exports every registered model and triggers registration."""
from app.providers.base import (  # noqa: F401
    LazyProvider,
    ProviderUnavailable,
    all_providers,
    get_provider,
    health_snapshot,
    register,
    warm_all,
)

# Importing the modules is what populates the registry.
from app.providers.detector import detector  # noqa: F401
from app.providers.embeddings import bge_m3, siglip  # noqa: F401
from app.providers.ocr import ocr  # noqa: F401
from app.providers.reranker import reranker  # noqa: F401
from app.providers.vlm import vlm  # noqa: F401

__all__ = [
    "detector",
    "siglip",
    "bge_m3",
    "reranker",
    "ocr",
    "vlm",
    "LazyProvider",
    "ProviderUnavailable",
    "register",
    "get_provider",
    "all_providers",
    "health_snapshot",
    "warm_all",
]
