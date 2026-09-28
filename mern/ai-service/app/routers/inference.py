"""Item understanding, matching, reranking, explanation and CCTV endpoints."""
from __future__ import annotations

import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core import cctv as cctv_core
from app.core import item_analysis, matching, pipeline, rtsp
from app.core.config import settings
from app.models.schemas import (
    CctvResponse,
    ExplainRequest,
    ExplainResponse,
    ItemAnalyzeResponse,
    MatchRequest,
    MatchResponse,
    RerankRequest,
    RerankResponse,
)
from app.providers import detector, reranker

log = logging.getLogger("lostlink.router")
router = APIRouter(tags=["inference"])


def detector_capable() -> dict:
    """Whether a clip that already sits on this host can be searched."""
    available = detector.available()
    return {
        "available": available,
        "notice": (
            "A clip stored on the analysis host can be searched." if available
            else "Object detection is not installed, so no footage can be searched."
        ),
    }


@router.post("/analyze-item", response_model=ItemAnalyzeResponse)
async def analyze_item(
    file: UploadFile = File(...),
    report_type: str = Form("LOST"),
    hints: str = Form(""),
) -> ItemAnalyzeResponse:
    """Analyse one uploaded image into a structured item profile.

    ``hints`` is a JSON object of whatever the user already typed. Fields the
    user filled in are never overwritten by the model.
    """
    import json  # noqa: PLC0415

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Image exceeds the size limit")

    parsed_hints: dict = {}
    if hints:
        try:
            loaded = json.loads(hints)
            parsed_hints = loaded if isinstance(loaded, dict) else {}
        except json.JSONDecodeError:
            log.warning("hints were not valid JSON; ignoring")

    try:
        result = item_analysis.analyze_item(
            data,
            filename=file.filename or "upload.jpg",
            report_type=report_type if report_type in ("LOST", "FOUND") else "LOST",
            hints=parsed_hints,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        log.exception("item analysis failed")
        raise HTTPException(
            status_code=500, detail=f"Item analysis failed: {type(exc).__name__}"
        ) from exc

    return ItemAnalyzeResponse(**result)


@router.post("/match", response_model=MatchResponse)
def match(payload: MatchRequest) -> MatchResponse:
    """Run the full retrieve -> rerank -> fuse -> explain pipeline."""
    if not payload.organization_id:
        raise HTTPException(status_code=400, detail="organization_id is required")
    result = pipeline.run_match(payload)
    return MatchResponse(**result)


@router.post("/rerank", response_model=RerankResponse)
def rerank(payload: RerankRequest) -> RerankResponse:
    """Rerank a candidate list. Distinct from /match so staff search can use it."""
    if not reranker.available():
        raise HTTPException(
            status_code=503,
            detail="Reranking is unavailable: BGE-reranker-v2-m3 is not installed.",
        )
    documents = [
        f"{c.description} {c.item_profile.get('category', '')} {c.item_profile.get('itemName', '')}".strip()
        for c in payload.candidates
    ]
    scores = reranker.score(payload.query_text, documents)
    pairs = {c.report_id: round(float(s), 4) for c, s in zip(payload.candidates, scores)}
    order = [rid for rid, _ in sorted(pairs.items(), key=lambda kv: kv[1], reverse=True)]
    return RerankResponse(
        provider="bge-reranker-v2-m3",
        model=reranker.model_id,
        scores=pairs,
        order=order[: payload.top_n],
    )


@router.post("/explain", response_model=ExplainResponse)
def explain(payload: ExplainRequest) -> ExplainResponse:
    """Explain a match.

    We only use the VLM when it is configured AND its output passes the
    grounding check in the provider. Otherwise we build the explanation
    deterministically from the evidence rows, which cannot invent a fact.
    """
    from app.providers import vlm  # noqa: PLC0415

    llm_text = None
    if vlm.available():
        llm_text = vlm.explain(payload.lost, payload.found, payload.evidence)

    if llm_text:
        return ExplainResponse(explanation=llm_text, source="llm")

    template = matching.build_explanation(
        payload.lost,
        payload.found,
        {"evidence": payload.evidence, "final_score": payload.final_score},
    )
    return ExplainResponse(explanation=template, source="template")


@router.post("/cctv/rtsp", response_model=CctvResponse)
def analyze_rtsp(payload: dict) -> CctvResponse:
    """Sample a LIVE RTSP stream for item-class objects.

    Refused with 400 when the deployment has not enabled camera ingest, and the
    refusal names the setting - an operator should never have to guess why a
    camera request did nothing. Item tracking only, never face recognition.
    """
    organization_id = payload.get("organization_id")
    if not organization_id:
        raise HTTPException(status_code=400, detail="organization_id is required")
    rtsp_url = str(payload.get("rtsp_url") or "").strip()
    if not rtsp_url:
        raise HTTPException(status_code=400, detail="rtsp_url is required")

    state = rtsp.capability()
    if not state["enabled"] or not state["available"]:
        # The service is healthy; this capability simply is not switched on.
        raise HTTPException(status_code=400, detail=state["notice"])

    try:
        result = rtsp.analyze_stream(
            organization_id=organization_id,
            report_id=payload.get("report_id", ""),
            rtsp_url=rtsp_url,
            camera=payload.get("camera", ""),
            location=payload.get("location", ""),
            seconds=float(payload.get("seconds", 30) or 30),
            sample_fps=float(payload.get("sample_fps", 0.5) or 0.5),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return CctvResponse(**result)


@router.get("/cctv/capabilities")
def cctv_capabilities() -> dict:
    """Uploaded clips, live streams, or neither - stated plainly."""
    return {
        "uploaded_clip_search": detector_capable(),
        "live_stream": rtsp.capability(),
    }


@router.post("/cctv/analyze", response_model=CctvResponse)
def analyze_cctv(payload: dict) -> CctvResponse:
    """CCTV last-seen search. Item tracking only - never face recognition."""
    organization_id = payload.get("organization_id")
    if not organization_id:
        raise HTTPException(status_code=400, detail="organization_id is required")
    result = cctv_core.analyze_video(
        organization_id=organization_id,
        report_id=payload.get("report_id", ""),
        video_path=payload.get("video_path", ""),
        camera=payload.get("camera", ""),
        location=payload.get("location", ""),
        target_image_bytes=payload.get("target_image_bytes"),
        target_description=payload.get("target_description", ""),
        sample_fps=float(payload.get("sample_fps", 0.5)),
    )
    return CctvResponse(**result)
