"""
Request / response contracts for the inference service.

These are the boundary between the Node API and this service. The Node side
(`mern/backend/src/services/aiClient.js`) sends the same shapes, so keep the
two in sync.

Design rule: every field a model actually produced is recorded in
`ai_fields` so the UI can show what is AI-derived and let the user correct it.
We never let a model state a fact it did not compute.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

Modality = Literal["image", "text"]


# --------------------------------------------------------------------------
# shared
# --------------------------------------------------------------------------
class ProviderInfo(BaseModel):
    name: str
    # "not_configured" is a provider whose external dependency (e.g. VLM_BASE_URL
    # for the vision model) was never switched on. It is distinct from
    # "unavailable": one is a supported deployment choice, the other is damage.
    status: Literal["ready", "lazy", "loading", "unavailable", "not_installed", "not_configured"]
    model: Optional[str] = None
    detail: Optional[str] = None
    device: Optional[str] = None
    load_seconds: Optional[float] = None
    optional: bool = False


class VlmStatus(BaseModel):
    """Whether a vision language model is configured, and what it is.

    `configured` is about configuration, not health: it stays true when the
    endpoint is set but currently down, which is exactly the distinction an
    operator needs when phrases come back heuristic instead of model-read.
    """

    configured: bool = False
    base_url: Optional[str] = None
    model: Optional[str] = None
    status: str = "unknown"
    notice: str = ""


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    service: str
    device: str
    providers: dict[str, ProviderInfo]
    vector_store: str
    # Tier detail: whether the tier serving right now is durable, whether it
    # degraded, and why. Kept separate from `vector_store` so existing clients
    # keep working while ops can see the real state.
    vector_detail: Optional[dict] = None
    vlm: Optional[VlmStatus] = None
    # Optional providers that are simply not switched on (e.g. the VLM without
    # VLM_BASE_URL). Listed so "degraded" keeps meaning "something is wrong".
    optional_missing: list[str] = []
    version: str = "1.0.0"


# --------------------------------------------------------------------------
# item understanding
# --------------------------------------------------------------------------
class ItemAnalyzeRequest(BaseModel):
    image_bytes: bytes = Field(..., description="Raw uploaded image bytes")
    filename: str = "upload.jpg"
    report_type: Literal["LOST", "FOUND"] = "LOST"
    # Text the user already typed. Used to reconcile model output and, for the
    # VLM path, as grounding context.
    hints: Optional[dict[str, Any]] = None
    organization_id: Optional[str] = None


class Detection(BaseModel):
    label: str
    confidence: float
    box: list[float] = Field(..., description="[x1, y1, x2, y2] in pixels")
    area_ratio: float
    is_primary: bool = False


class FieldSource(BaseModel):
    """Which signal produced one attribute, and whether a model was involved.

    `source` is one of: user, vlm, detector, ocr, pixels, filename, none.
    `model_backed` is false for pixel statistics and filename guesses, which are
    measurements and heuristics rather than model output - the UI says so.
    """

    source: str
    model_backed: bool = False
    detail: str = ""


class SignalContribution(BaseModel):
    """One signal's contribution to the analysis, grouped by provider."""

    signal: str
    provider: str
    model_backed: bool = False
    fields: list[str] = []


class ItemAnalyzeResponse(BaseModel):
    provider: str
    detection_provider: str
    ocr_provider: str
    analysis_version: str
    confidence: float

    # Every field's origin, and the signals that produced the profile. Additive:
    # nothing here changes what the fields mean, it just stops the response from
    # implying that one opaque \"AI\" produced everything.
    field_sources: dict[str, FieldSource] = {}
    signals: list[SignalContribution] = []
    vlm: Optional[VlmStatus] = None

    # geometry
    width: int
    height: int
    aspect_ratio: Optional[float]

    # detection
    detections: list[Detection] = []
    primary_detection: Optional[Detection] = None

    # structured attributes
    item_profile: dict[str, Any]
    ai_fields: list[str] = []

    # raw text recovered by OCR
    ocr_text: str = ""
    ocr_lines: list[str] = []

    # honest capability note surfaced in the UI
    notice: str = ""


# --------------------------------------------------------------------------
# embeddings
# --------------------------------------------------------------------------
class EmbedRequest(BaseModel):
    text: Optional[str] = None
    image_bytes: Optional[bytes] = None
    modality: Modality = "text"


class EmbedResponse(BaseModel):
    modality: Modality
    model: str
    dim: int
    vector: list[float]
    provider: str


class BatchEmbedRequest(BaseModel):
    texts: list[str]
    modality: Modality = "text"


class BatchEmbedResponse(BaseModel):
    modality: Modality
    model: str
    dim: int
    vectors: list[list[float]]
    provider: str


# --------------------------------------------------------------------------
# candidate report, sent from Mongo by the Node worker
# --------------------------------------------------------------------------
class Candidate(BaseModel):
    report_id: str
    report_type: Literal["LOST", "FOUND"]
    organization_id: str
    reference: str = ""
    description: str = ""
    category: str = ""
    location: str = ""
    item_profile: dict[str, Any] = {}
    relevant_date: Optional[str] = None
    # Pre-computed embeddings when the worker already has them. Avoids a
    # second pass through the model for every candidate.
    image_vector: Optional[list[float]] = None
    text_vector: Optional[list[float]] = None


class RerankRequest(BaseModel):
    query_text: str
    query_text_vector: Optional[list[float]] = None
    candidates: list[Candidate]
    top_n: int = 20


class RerankResponse(BaseModel):
    provider: str
    model: str
    scores: dict[str, float] = Field(
        default_factory=dict, description="report_id -> rerank score in [0,1]"
    )
    order: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------
# full matching pipeline
# --------------------------------------------------------------------------
class MatchRequest(BaseModel):
    organization_id: str
    report_id: str
    report_type: Literal["LOST", "FOUND"]
    image_bytes: Optional[bytes] = None
    text: str = ""
    description: str = ""
    category: str = ""
    location: str = ""
    item_profile: dict[str, Any] = {}
    relevant_date: Optional[str] = None
    # Pre-computed embeddings for the QUERY side. The Node worker already
    # generated and stored these when the report was created, so re-embedding
    # here would be a second full model pass for no benefit. When both the query
    # and a candidate carry vectors, score_pair uses the real cosine instead of
    # the attribute / keyword proxy.
    image_vector: Optional[list[float]] = None
    text_vector: Optional[list[float]] = None
    candidates: list[Candidate] = []
    weights: Optional[dict[str, float]] = None
    top_n: int = 5


class MatchEvidence(BaseModel):
    signal: str
    label: str
    score: float
    weight: float
    contribution: float
    detail: str = ""
    # True when the signal came from a real model rather than a metadata
    # proxy. The UI must not present a proxy as an AI measurement.
    model_backed: bool = False


class MatchCandidate(BaseModel):
    report_id: str
    report_type: str
    final_score: float
    band: Literal["high", "review", "low"]
    evidence: list[MatchEvidence]
    explanation: str = ""
    reference: str = ""
    location: str = ""
    category: str = ""
    relevant_date: Optional[str] = None


class MatchResponse(BaseModel):
    provider: str
    analysis_version: str
    weights: dict[str, float]
    candidates: list[MatchCandidate]
    # Signals that were unavailable, so the caller can label the score honestly.
    degraded_signals: list[str] = []
    # Whether an LLM wrote the explanation or it was templated from evidence.
    explanation_source: Literal["llm", "template", "none"] = "template"


# --------------------------------------------------------------------------
# explanation
# --------------------------------------------------------------------------
class ExplainRequest(BaseModel):
    lost: dict[str, Any]
    found: dict[str, Any]
    evidence: list[dict[str, Any]]
    final_score: float


class ExplainResponse(BaseModel):
    explanation: str
    source: Literal["llm", "template"]


# --------------------------------------------------------------------------
# CCTV / last-seen
# --------------------------------------------------------------------------
class CctvAnalyzeRequest(BaseModel):
    organization_id: str
    report_id: str
    camera: str = ""
    location: str = ""
    target_item_name: str = ""
    target_description: str = ""
    video_path: Optional[str] = None
    target_image_bytes: Optional[bytes] = None
    sample_fps: float = 0.5


class CctvEvent(BaseModel):
    id: str
    camera: str
    location: str
    detected_at: str
    confidence: float
    track_id: Optional[int] = None
    thumbnail: Optional[str] = None
    # Which COCO class the track was, and how many sampled frames it survived.
    # Surfaced because "a backpack, seen in 4 sampled frames" is checkable
    # evidence, while a bare confidence number is not.
    label: str = ""
    frame_count: int = 0


class CctvResponse(BaseModel):
    provider: str
    status: Literal["completed", "partial", "unavailable"]
    report_id: str
    events: list[CctvEvent] = []
    last_seen: Optional[CctvEvent] = None
    frames_analyzed: int = 0
    notice: str = ""


