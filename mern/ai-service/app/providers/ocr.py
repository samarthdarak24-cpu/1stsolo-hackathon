"""
OCR provider — reads text that is physically printed on the item.

Serial numbers, brand wordmarks, model codes, stickers, names. This is the
single highest-signal evidence for proving an item is a specific physical
object rather than "a black bag", so we extract it and surface it separately
in the evidence panel rather than folding it into the description score.

Two engines, tried in order:

1. ``rapidocr`` (default). PaddleOCR's own models converted to ONNX and served
   by onnxruntime. The wheels are small (no paddlepaddle, which is a ~700MB
   dependency on Windows) and the models ship inside the package, so a fresh
   install works offline. This is the engine that actually runs in this repo.
2. ``paddleocr`` (fallback). Kept for deployments that already have paddlepaddle
   installed; it is tried only when RapidOCR is absent.

Graceful degradation: OCR is an optional install. When neither engine is present
``available()`` is False and the caller falls back to image-metadata + filename
heuristics, clearly labelled as such rather than presented as a reading.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from app.core.config import settings
from app.providers.base import LazyProvider, register

log = logging.getLogger("lostlink.providers.ocr")

# Serial / model codes look like ALN-7734B, SN12345678, XZ22019 etc.
SERIAL_PATTERN = re.compile(r"\b(?:sn|serial|model|mdl|part|p\/n|no)\s*[:#-]?\s*([a-z0-9-]{5,})\b", re.I)
BARE_CODE_PATTERN = re.compile(r"\b(?=[a-z0-9-]*\d)[a-z0-9]{3,}-[a-z0-9-]{2,}\b", re.I)


class OcrProvider(LazyProvider):
    name = "ocr"
    model_id = f"rapidocr:{settings.ocr_lang}"

    def _load(self) -> Any:
        engine = self._load_rapidocr()
        if engine is not None:
            return engine
        return self._load_paddle()

    @staticmethod
    def _load_rapidocr() -> Any:
        """RapidOCR: PaddleOCR weights on onnxruntime. Preferred: small, CPU-only."""
        try:
            from rapidocr import RapidOCR  # noqa: PLC0415
        except ImportError:
            return None
        return RapidOCR()

    @staticmethod
    def _load_paddle() -> Any:
        try:
            from paddleocr import PaddleOCR  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError(
                "no OCR engine installed - run: pip install rapidocr onnxruntime"
            ) from exc
        return PaddleOCR(use_angle_cls=True, lang=settings.ocr_lang, show_log=False)

    # ------------------------------------------------------------------
    def read(self, image: Any) -> dict[str, Any]:
        """Run OCR and return text plus the codes we recognised in it.

        The two engines return completely different shapes, so each is parsed
        into one common structure here rather than leaking engine details into
        the pipeline.
        """
        engine = self.require()
        try:
            if type(engine).__name__ == "RapidOCR":
                lines, confidences = self._read_rapidocr(engine, image)
            else:
                lines, confidences = self._read_paddle(engine, image)
        except Exception as exc:  # noqa: BLE001 - one bad image must not kill the request
            log.warning("ocr failed on this image: %s", exc)
            return {"text": "", "lines": [], "avg_confidence": 0.0, "serials": []}

        joined = " ".join(lines)
        return {
            "text": joined,
            "lines": lines,
            "avg_confidence": (
                round(sum(confidences) / len(confidences), 4) if confidences else 0.0
            ),
            "serials": self.extract_serials(joined),
        }

    @staticmethod
    def _read_rapidocr(engine: Any, image: Any) -> tuple[list[str], list[float]]:
        """RapidOCR >= 3 returns a RapidOCROutput with txts/scores tuples."""
        raw = engine(image)
        txts = getattr(raw, "txts", None) or ()
        scores = getattr(raw, "scores", None) or ()
        lines: list[str] = []
        confidences: list[float] = []
        for text, score in zip(txts, scores):
            value = (text or "").strip()
            if value:
                lines.append(value)
                confidences.append(float(score))
        return lines, confidences

    @staticmethod
    def _read_paddle(engine: Any, image: Any) -> tuple[list[str], list[float]]:
        """PaddleOCR returns [[ [box, (text, score)], ... ]] per page."""
        raw = engine.ocr(image, cls=True)
        lines: list[str] = []
        confidences: list[float] = []
        for page in raw or []:
            if not page:
                continue
            for entry in page:
                try:
                    text, confidence = entry[1][0], float(entry[1][1])
                except (IndexError, TypeError):
                    continue
                text = (text or "").strip()
                if text:
                    lines.append(text)
                    confidences.append(confidence)
        return lines, confidences


    @staticmethod
    def extract_serials(text: str) -> list[str]:
        """Pull out candidate serial/model numbers from OCR text."""
        if not text:
            return []
        found: list[str] = []
        for match in SERIAL_PATTERN.finditer(text):
            found.append(match.group(1))
        found.extend(BARE_CODE_PATTERN.findall(text))
        # de-duplicate, keep order
        seen: set[str] = set()
        out: list[str] = []
        for value in found:
            key = value.strip().lower()
            if key and key not in seen:
                seen.add(key)
                out.append(value.strip())
        return out[:8]


ocr = register(OcrProvider())
