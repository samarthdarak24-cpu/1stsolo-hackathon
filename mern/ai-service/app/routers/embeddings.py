"""Embedding endpoints (text and image)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from app.core.pipeline import embed_image, embed_texts
from app.models.schemas import (
    BatchEmbedRequest,
    BatchEmbedResponse,
    EmbedRequest,
    EmbedResponse,
)
from app.providers import bge_m3, siglip

router = APIRouter(prefix="/embed", tags=["embeddings"])


@router.post("/text", response_model=BatchEmbedResponse)
def embed_text(payload: BatchEmbedRequest) -> BatchEmbedResponse:
    if not bge_m3.available():
        raise HTTPException(
            status_code=503,
            detail=(
                "Text embeddings are unavailable: BGE-M3 is not installed. "
                "Run: pip install -r requirements-ml.txt"
            ),
        )
    vectors = embed_texts(payload.texts)
    if vectors is None:
        raise HTTPException(status_code=503, detail="Text embedding failed")
    return BatchEmbedResponse(
        modality="text",
        model=bge_m3.model_id,
        dim=len(vectors[0]) if vectors else 0,
        vectors=vectors,
        provider="bge-m3",
    )


@router.post("/image", response_model=EmbedResponse)
def embed_image_endpoint(payload: EmbedRequest) -> EmbedResponse:
    if not payload.image_bytes:
        raise HTTPException(status_code=400, detail="image_bytes is required")
    if not siglip.available():
        raise HTTPException(
            status_code=503,
            detail=(
                "Image embeddings are unavailable: SigLIP2 is not installed. "
                "Run: pip install -r requirements-ml.txt"
            ),
        )
    vector = embed_image(payload.image_bytes)
    if vector is None:
        raise HTTPException(status_code=503, detail="Image embedding failed")
    return EmbedResponse(
        modality="image",
        model=siglip.model_id,
        dim=len(vector),
        vector=vector,
        provider="siglip2",
    )
