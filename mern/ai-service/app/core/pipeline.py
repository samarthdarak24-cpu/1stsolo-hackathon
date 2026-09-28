"""
End-to-end matching pipeline.

    report (image + text)
        -> YOLO26 crop          [optional]
        -> SigLIP2 image vector  [optional]
        -> BGE-M3 text vector    [optional]
        -> Qdrant search         (organizationId filter is mandatory)
        -> BGE reranker          [optional, top-K only]
        -> multi-signal fusion   (always runs)
        -> explanation           (VLM if grounded, else template)
        -> ranked candidates

Design rules that hold throughout:
  * every optional model may be absent; the pipeline still returns candidates
    and reports which signals it could not evaluate
  * the organization filter is applied at the vector-store level, never
    inferred from application code
  * the explanation only ever restates measured evidence
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from app.core import matching
from app.core.config import settings
from app.providers import bge_m3, reranker, siglip, vlm
from app.vector import NAMESPACE_IMAGE, NAMESPACE_TEXT, store

log = logging.getLogger("lostlink.pipeline")


def embed_image(image_bytes: bytes) -> Optional[list[float]]:
    """SigLIP2 image embedding, or None when unavailable."""
    if not siglip.available():
        return None
    try:
        import base64  # noqa: PLC0415
        import binascii  # noqa: PLC0415
        import io  # noqa: PLC0415

        from PIL import Image  # noqa: PLC0415

        raw = image_bytes
        # JSON clients send base64 text, which Pydantic hands us as the ASCII
        # bytes of that text rather than the decoded file. Detect the common
        # image signatures first; only decode when the bytes are not already an
        # image, so a genuine binary upload still works untouched.
        if not _looks_like_image(raw):
            try:
                raw = base64.b64decode(raw, validate=True)
            except (binascii.Error, ValueError):
                # Not base64 either; fall through and let PIL report the problem.
                pass

        # Canonical decode + square-crop + resize before the encoder, so every
        # photo produces comparable vectors (and SVG placeholders fail with a
        # clear, catchable reason instead of a PIL decode error).
        from app.core.preprocess import normalise_for_embedding  # noqa: PLC0415

        image = normalise_for_embedding(raw)
        return siglip.embed_images([image])[0]
    except Exception as exc:  # noqa: BLE001
        log.warning("siglip image embed failed: %s", exc)
        return None


def _looks_like_image(data: bytes) -> bool:
    """Cheap magic-byte check for PNG/JPEG/WEBP/BMP/GIF."""
    if not data or len(data) < 12:
        return False
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    if data[:3] == b"\xff\xd8\xff":  # JPEG
        return True
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return True
    if data[:2] in (b"BM",):  # BMP
        return True
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return True
    return False


def embed_texts(texts: list[str]) -> Optional[list[list[float]]]:
    """BGE-M3 text embeddings, or None when unavailable."""
    if not texts or not bge_m3.available():
        return None
    try:
        return bge_m3.embed_texts(texts)
    except Exception as exc:  # noqa: BLE001
        log.warning("bge-m3 embed failed: %s", exc)
        return None


def index_report(
    organization_id: str,
    report_id: str,
    report_type: str,
    image_bytes: Optional[bytes],
    text: str,
    category: str = "",
    location: str = "",
    created_at: Optional[str] = None,
) -> dict[str, Any]:
    """Embed and store one report in the vector store.

    Returns which modalities were indexed so the caller can persist that to
    Mongo rather than guessing.
    """
    result: dict[str, Any] = {
        "image": False,
        "text": False,
        "image_model": None,
        "text_model": None,
        "vector_store": store.mode,
    }

    if image_bytes:
        vector = embed_image(image_bytes)
        if vector:
            store.upsert(
                NAMESPACE_IMAGE,
                organization_id,
                [
                    {
                        "report_id": report_id,
                        "vector": vector,
                        "report_type": report_type,
                        "category": category,
                        "location": location,
                        "model": siglip.model_id,
                        "created_at": created_at,
                    }
                ],
            )
            result["image"] = True
            result["image_model"] = siglip.model_id

    if text.strip():
        vectors = embed_texts([text])
        if vectors:
            store.upsert(
                NAMESPACE_TEXT,
                organization_id,
                [
                    {
                        "report_id": report_id,
                        "vector": vectors[0],
                        "report_type": report_type,
                        "category": category,
                        "location": location,
                        "model": bge_m3.model_id,
                        "created_at": created_at,
                    }
                ],
            )
            result["text"] = True
            result["text_model"] = bge_m3.model_id

    return result


def _compose_text(description: str, item_profile: dict[str, Any]) -> str:
    """Build the text we embed: description plus the distinguishing fields."""
    profile = item_profile or {}
    bits = [description or ""]
    for field in ("category", "itemName", "primaryColor", "brand", "material", "visibleMark"):
        value = profile.get(field)
        if value:
            bits.append(str(value))
    return " ".join(b for b in bits if b).strip()


def run_match(payload: Any) -> dict[str, Any]:
    """Full matching pipeline for one report.

    ``payload`` is a ``MatchRequest``. Candidates are supplied by the Node
    worker (it owns the Mongo read, so this service never touches Mongo).
    """
    weights = matching.resolve_weights(payload.weights)
    degraded: set[str] = set()

    # Nothing to score? Then do not touch a single model. `shortlist` can only
    # ever be a subset of the candidates the caller supplied (a retrieved id
    # that is not in that list is dropped below), so an empty list is a
    # guaranteed empty result. Checking first means a match against an empty
    # org costs milliseconds instead of a multi-gigabyte model load.
    candidate_map = {c.report_id: c for c in payload.candidates}
    if not candidate_map:
        return {
            "provider": "pipeline",
            "analysis_version": _version(peek=True),
            "weights": weights,
            "candidates": [],
            "degraded_signals": sorted(degraded),
            "explanation_source": "none",
        }

    # ---- embed the query ---------------------------------------------
    text = _compose_text(payload.description, payload.item_profile) or payload.text
    # Prefer vectors the caller already computed. Re-embedding here would be a
    # second full model pass, and reusing the stored vector guarantees the query
    # and the candidates come from the same checkpoint.
    query_text_vector = payload.text_vector
    if query_text_vector is None and text.strip():
        text_vectors = embed_texts([text])
        query_text_vector = text_vectors[0] if text_vectors else None
    if query_text_vector is None and text.strip():
        degraded.add("semantic")

    query_image_vector = payload.image_vector
    if query_image_vector is None and payload.image_bytes:
        query_image_vector = embed_image(payload.image_bytes)
    if query_image_vector is None and (payload.image_bytes or payload.image_vector):
        degraded.add("visual")

    # ---- retrieve ----------------------------------------------------
    retrieved = retrieve_candidates(
        payload.organization_id,
        query_image_vector,
        query_text_vector,
        settings.match_top_k,
    )

    # Union with the candidate list the caller already loaded, so a candidate
    # with no embedding (e.g. an older report) is still scored on the signals
    # we do have rather than being silently dropped.
    shortlist: list[Any] = [
        candidate_map[rid] for rid in retrieved if rid in candidate_map
    ]
    shortlist += [c for rid, c in candidate_map.items() if rid not in retrieved]

    if not shortlist:
        return {
            "provider": "pipeline",
            "analysis_version": _version(),
            "weights": weights,
            "candidates": [],
            "degraded_signals": sorted(degraded),
            "explanation_source": "none",
        }

    # ---- rerank the shortlist ----------------------------------------
    rerank_scores: dict[str, float] = {}
    rerank_used = False
    if reranker.available() and text.strip() and len(shortlist) > 1:
        try:
            documents = [_compose_text(c.description, c.item_profile) for c in shortlist]
            raw_scores = reranker.score(text, documents)
            rerank_scores = {c.report_id: float(s) for c, s in zip(shortlist, raw_scores)}
            rerank_used = True
        except Exception as exc:  # noqa: BLE001
            log.warning("reranker failed: %s", exc)

    # ---- score every candidate ---------------------------------------
    report_view = {
        "description": payload.description,
        "text": text,
        "category": payload.category,
        "location": payload.location,
        "itemProfile": payload.item_profile or {},
        "relevant_date": payload.relevant_date,
        "imageVector": query_image_vector,
        "textVector": query_text_vector,
    }

    results: list[dict[str, Any]] = []
    for candidate in shortlist:
        candidate_view = {
            "description": candidate.description,
            "category": candidate.category,
            "location": candidate.location,
            "itemProfile": candidate.item_profile or {},
            "relevant_date": candidate.relevant_date,
            "image_vector": candidate.image_vector,
            "text_vector": candidate.text_vector,
        }
        outcome = matching.score_pair(
            report_view, candidate_view, weights, settings.match_window_days
        )
        outcome.update(
            {
                "report_id": candidate.report_id,
                "report_type": candidate.report_type,
                "reference": candidate.reference,
                "location": candidate.location,
                "category": candidate.category,
                "relevant_date": candidate.relevant_date,
                "retrieval_score": round(retrieved.get(candidate.report_id, 0.0), 4),
                "rerank_score": (
                    round(rerank_scores[candidate.report_id], 4)
                    if candidate.report_id in rerank_scores
                    else None
                ),
            }
        )
        outcome["band"] = matching.band_for(
            outcome["final_score"], settings.match_high_confidence
        )
        degraded.update(outcome.pop("degraded", []))
        results.append(outcome)

    results.sort(key=lambda r: r["final_score"], reverse=True)
    top = results[: payload.top_n]

    # ---- explain -----------------------------------------------------
    # VLM explanation is accepted ONLY when it passes the grounding check in
    # the provider; otherwise we fall back to the deterministic template.
    source = "template"
    for outcome in top:
        candidate = candidate_map[outcome["report_id"]]
        candidate_view = {
            "description": candidate.description,
            "category": candidate.category,
            "location": candidate.location,
            "itemProfile": candidate.item_profile or {},
        }
        text_out = None
        if vlm.available():
            text_out = vlm.explain(report_view, candidate_view, outcome["evidence"])
        if text_out:
            source = "llm"
            outcome["explanation"] = text_out
        else:
            outcome["explanation"] = matching.build_explanation(
                report_view, candidate_view, outcome
            )

    if not rerank_used and len(shortlist) > 1:
        degraded.add("rerank")

    return {
        "provider": "pipeline",
        "analysis_version": _version(),
        "weights": weights,
        "candidates": top,
        "degraded_signals": sorted(degraded),
        "explanation_source": source,
    }


def _version(peek: bool = False) -> str:
    """Describe the model configuration behind these results.

    ``peek=True`` reports only what is already loaded, without starting any
    load. Used on paths that return before doing inference, so a cheap
    response never pays for multi-gigabyte weights.
    """
    # `store:` names the tier that ACTUALLY served these results. It used to
    # report a bare mode, so a run that had silently degraded to the per-process
    # index still read "store:qdrant-local" - a version string that was wrong
    # about durability, which is the one thing it is for. A degraded tier is now
    # spelled out, and the reason travels with it.
    tier = store.describe()
    store_part = f"store:{tier['mode']}"
    if tier.get("degraded"):
        # Name the tier we fell FROM when it is known; a first-attempt failure at
        # boot genuinely has none, and saying "unknown" there reads like a bug.
        origin = tier.get("degraded_from")
        store_part += f"(degraded-from:{origin})" if origin else "(degraded)"

    if peek:
        parts = [
            "siglip" if siglip.is_ready() else "no-siglip",
            "bge-m3" if bge_m3.is_ready() else "no-bge-m3",
            "reranker" if reranker.is_ready() else "no-reranker",
            store_part,
        ]
        return ":".join(parts)

    parts = [
        "siglip" if siglip.available() else "no-siglip",
        "bge-m3" if bge_m3.available() else "no-bge-m3",
        "reranker" if reranker.available() else "no-reranker",
        store_part,
    ]
    return ":".join(parts)




def retrieve_candidates(
    organization_id: str,
    image_vector: Optional[list[float]],
    text_vector: Optional[list[float]],
    limit: int,
) -> dict[str, list[float]]:
    """Union of the image and text result sets, keyed by report_id.

    Both namespaces are searched with the organization filter. A candidate
    found by either modality is a candidate - requiring agreement would throw
    away genuine matches where one modality simply has no data.
    """
    scores: dict[str, float] = {}

    if image_vector:
        for hit in store.search(NAMESPACE_IMAGE, image_vector, organization_id, limit):
            report_id = hit.get("report_id")
            if report_id:
                scores[report_id] = max(scores.get(report_id, 0.0), hit.get("score", 0.0))

    if text_vector:
        for hit in store.search(NAMESPACE_TEXT, text_vector, organization_id, limit):
            report_id = hit.get("report_id")
            if report_id:
                scores[report_id] = max(scores.get(report_id, 0.0), hit.get("score", 0.0))

    return scores
