"""
Central configuration for the LostLink AI inference service.

Read once at import time from the environment (optionally via .env). Nothing
else in the codebase touches os.environ directly.

Model identifiers follow the architecture spec:
  detection   -> YOLO26n (Ultralytics)
  vision emb  -> SigLIP2
  text emb    -> BGE-M3
  reranker    -> BGE-reranker-v2-m3
  ocr         -> RapidOCR (PaddleOCR weights on onnxruntime)
  vlm         -> Qwen3-VL (OpenAI-compatible endpoint)
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # ---- service ----
    service_name: str = "LostLink AI Inference Service"
    host: str = "0.0.0.0"
    port: int = 8100
    log_level: str = "INFO"

    # ---- model identifiers ----
    yolo_model: str = "yolo26n.pt"
    yolo_confidence: float = 0.25
    yolo_iou: float = 0.7
    # Smallest detection we treat as "the item" rather than background clutter.
    yolo_min_box_area: float = 0.01

    siglip_model: str = "google/siglip2-base-patch16-224"
    bge_text_model: str = "BAAI/bge-m3"
    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    ocr_lang: str = "en"
    qwen_model: str = "qwen3-vl"
    vlm_base_url: str = ""
    vlm_api_key: str = ""
    vlm_timeout_seconds: float = 30.0

    # ---- device ----
    # "auto" -> cuda when available, else cpu
    device: str = "auto"

    # ---- boot warm-up ----
    # Models load lazily so the service accepts requests within a second. On a
    # CPU-only box that means the FIRST item scan pays the whole load cost
    # (YOLO + SigLIP + BGE-M3 weights) while a user waits on the spinner.
    # Enabling this preloads them in a background thread instead.
    warmup_on_boot: bool = False
    # Which providers to preload. "*" or empty means every registered provider;
    # a list like "detector,siglip,ocr" preloads only the scan path and skips
    # the two 500M-parameter text models, which is the cheap way to make the
    # first photo upload feel instant.
    warmup_providers: str = "*"

    # ---- vector store ----
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    qdrant_collection: str = "lostlink_vectors"
    # When a Qdrant server is unreachable we fall back in two steps (see
    # app/vector/store.py): first to Qdrant's local on-disk mode, which keeps
    # embeddings across restarts; only if that is impossible do we drop to a
    # per-process index that forgets everything on restart.
    allow_vector_fallback: bool = True
    qdrant_local_path: str = "storage/qdrant-local"
    # How long a failed vector operation stays on the in-memory index before the
    # durable tier is retried. A single transient error must not cost the
    # process its durability for the rest of its life (see vector/store.py).
    vector_retry_seconds: float = 10.0

    # ---- matching ----
    # Node config.matching is the source of truth and passes weights per
    # request; these are only the local defaults.
    match_top_k: int = 20
    match_final_top_n: int = 5
    match_min_score: float = 35.0
    match_high_confidence: float = 85.0
    match_window_days: int = 14

    # ---- live camera ingest (RTSP) ----
    # Off by default and deliberately so: subscribing to an organisation's
    # camera network is a deployment decision, not something a clone-and-run
    # should do. When off, every live-camera request answers with the explicit
    # reason instead of failing obscurely (see app/core/rtsp.py).
    rtsp_enabled: bool = False
    # Comma-separated host allowlist. Empty means "any host is reachable", which
    # is fine on a trusted LAN and a bad idea elsewhere - /health says so.
    rtsp_allowed_hosts: str = ""
    # Hard bounds: a live stream never ends, so a request must not be able to
    # hold a worker open indefinitely.
    rtsp_max_seconds: float = 60.0
    rtsp_max_frames: int = 120

    # ---- uploads ----
    storage_dir: str = "storage"
    max_upload_bytes: int = 5 * 1024 * 1024

    # ---- CORS (the Node API) ----
    cors_origins: str = "http://localhost:5173,http://localhost:5174,http://localhost:8080"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def warmup_provider_list(self) -> list[str]:
        """Empty list means "every provider"."""
        raw = (self.warmup_providers or "*").strip()
        if raw in ("", "*"):
            return []
        return [p.strip() for p in raw.split(",") if p.strip()]

    @property
    def resolved_device(self) -> str:
        if self.device != "auto":
            return self.device
        try:
            import torch  # noqa: PLC0415

            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            return "cpu"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
