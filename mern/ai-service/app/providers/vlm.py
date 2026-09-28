"""
Qwen3-VL provider â€” structured attribute extraction and match explanation.

Two jobs:

1. ``extract_attributes(image)`` -> structured item profile as JSON.
2. ``explain(lost, found, evidence)`` -> human-readable "why this match".

CRITICAL RULE
-------------
The explanation may only describe signals that were actually computed and are
present in the ``evidence`` list. The prompt forbids the model from
introducing new facts, and we post-validate its output. If it cites a signal we
did not measure, we discard the generation and let the caller fall back to the
deterministic template.

That is deliberate: an LLM that says "the logos match" when no logo was ever
compared is exactly the kind of false confidence this product must not have,
because a high-confidence match drives a real person's item being handed over.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.providers.base import LazyProvider, register

log = logging.getLogger("lostlink.providers.vlm")

EXTRACTION_PROMPT = """You are analysing a photo of a personal item that was lost or found.
Return ONLY a JSON object with these keys, using "" for anything you cannot see:
{
  "category": "",
  "itemName": "",
  "primaryColor": "",
  "secondaryColor": "",
  "brand": "",
  "model": "",
  "material": "",
  "shape": "",
  "size": "",
  "condition": "",
  "visibleMark": "",
  "confidence": 0.0
}
Rules:
- Only report what is visibly supported by the image.
- If you cannot see it, use an empty string. Never guess a brand.
- confidence is your own 0-1 estimate of the whole extraction."""

EXPLANATION_PROMPT = """You are explaining a candidate lost-and-found match to a user.
You may ONLY reference the signals listed in EVIDENCE, using the exact labels given.
You must NOT introduce any other fact, and must NOT claim ownership.
2-4 sentences. Plain text, no markdown, no bullet points. Begin by restating the final score.

EVIDENCE:
{evidence}

LOST REPORT:
{lost}

FOUND REPORT:
{found}
"""


def config_state() -> dict[str, Any]:
    """Configuration state of the vision model, without loading anything.

    Deliberately does not call ``available()``: that would attempt a model load,
    and this feeds /health, which has to stay fast and must never trigger a
    download. ``status`` therefore describes configuration; the provider's own
    snapshot entry describes whether it is loaded.
    """
    configured = bool(settings.vlm_base_url)
    if configured:
        notice = (
            "A vision model is configured, so item attributes are read from the "
            f"photo ({settings.qwen_model})."
        )
    else:
        notice = (
            "No vision model is configured (VLM_BASE_URL is unset), so attributes "
            "come from detection, dominant colour, OCR and your own input. Set "
            "VLM_BASE_URL to any OpenAI-compatible endpoint to enable it."
        )
    return {
        "configured": configured,
        "base_url": settings.vlm_base_url or None,
        "model": settings.qwen_model if configured else None,
        "status": "unknown",
        "notice": notice,
    }


class QwenVlProvider(LazyProvider):
    """OpenAI-compatible vision client for Qwen3-VL.

    Deliberately an HTTP client rather than a local transformers load: Qwen3-VL
    weights are large, and serving them (vLLM / Ollama / a hosted endpoint) is
    the normal deployment. ``VLM_BASE_URL`` points at whichever is running.
    """

    name = "vlm"
    model_id = settings.qwen_model

    # The vision model lives behind an external endpoint, so an unset
    # VLM_BASE_URL is a valid, supported deployment rather than a fault.
    def is_configured(self) -> bool:
        return bool(settings.vlm_base_url)

    def _load(self) -> dict[str, Any]:
        if not settings.vlm_base_url:
            raise RuntimeError(
                "VLM_BASE_URL is not configured - set it to an OpenAI-compatible "
                "endpoint serving Qwen3-VL, or leave unset to use heuristics"
            )
        return {
            "base_url": settings.vlm_base_url.rstrip("/"),
            "headers": (
                {"Authorization": f"Bearer {settings.vlm_api_key}"}
                if settings.vlm_api_key
                else {}
            ),
        }

    # ------------------------------------------------------------------
    def _chat(self, content: list[dict[str, Any]], max_tokens: int = 700) -> str:
        import base64  # noqa: PLC0415

        bundle = self.require()
        payload = {
            "model": settings.qwen_model,
            "messages": [{"role": "user", "content": content}],
            "temperature": 0.1,
            "max_tokens": max_tokens,
        }
        url = f"{bundle['base_url']}/chat/completions"
        with httpx.Client(timeout=settings.vlm_timeout_seconds) as client:
            response = client.post(url, json=payload, headers=bundle["headers"])
            response.raise_for_status()
            data = response.json()
        return data["choices"][0]["message"]["content"]

    @staticmethod
    def _image_part(image_bytes: bytes) -> dict[str, Any]:
        import base64  # noqa: PLC0415

        encoded = base64.b64encode(image_bytes).decode()
        return {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
        }

    # ------------------------------------------------------------------
    def extract_attributes(self, image_bytes: bytes) -> dict[str, Any]:
        """Structured attribute extraction. Returns a partial dict on success."""
        try:
            raw = self._chat(
                [self._image_part(image_bytes), {"type": "text", "text": EXTRACTION_PROMPT}]
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("vlm extraction failed: %s", exc)
            return {}
        return self._parse_json(raw)

    def explain(
        self,
        lost: dict[str, Any],
        found: dict[str, Any],
        evidence: list[dict[str, Any]],
    ) -> Optional[str]:
        """Grounded explanation, or None when the model over-claimed.

        Returning ``None`` is how the caller knows to use the deterministic
        template instead.
        """
        allowed = {str(e.get("label", "")).lower() for e in evidence if e.get("label")}
        if not allowed:
            return None
        prompt = EXPLANATION_PROMPT.format(
            evidence=json.dumps(evidence, indent=2)[:4000],
            lost=json.dumps(lost, default=str)[:1500],
            found=json.dumps(found, default=str)[:1500],
        )
        try:
            raw = self._chat([{"type": "text", "text": prompt}], max_tokens=300)
        except Exception as exc:  # noqa: BLE001
            log.warning("vlm explanation failed: %s", exc)
            return None

        text = (raw or "").strip()
        if not text or not self._is_grounded(text, allowed):
            if text:
                log.warning("discarding ungrounded VLM explanation")
            return None
        return text

    @staticmethod
    def _is_grounded(text: str, allowed_labels: set[str]) -> bool:
        """Reject explanations that cite signals we never measured.

        This is a cheap guard, not full NER: we check the small set of signal
        phrases the pipeline knows about, plus ban outright ownership claims.
        """
        known = {
            "visual similarity",
            "semantic similarity",
            "attribute match",
            "location",
            "time",
            "context",
            "category",
        }
        lowered = text.lower()
        for banned in ("same owner", "is the owner", "proven", "guarantee", "belongs to"):
            if banned in lowered:
                return False
        for phrase in known - allowed_labels:
            if phrase in lowered:
                return False
        return True

    @staticmethod
    def _parse_json(raw: str) -> dict[str, Any]:
        if not raw:
            return {}
        match = re.search(r"\{.*\}", raw, re.S)
        if not match:
            return {}
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            log.warning("vlm returned unparseable JSON")
            return {}
        return data if isinstance(data, dict) else {}


vlm = register(QwenVlProvider())

