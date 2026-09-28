"""
Item understanding pipeline.

Given one image, produce a structured item profile and record exactly which
fields came from a model.

Signal sourcing, best first:
    1. Qwen3-VL   - real attribute extraction from the pixels
    2. YOLO26n    - object detection + the crop we actually reason about
    3. PaddleOCR  - text physically printed on the item
    4. Pillow     - true dimensions, dominant colour, brightness, sharpness

Every field is tagged in ``ai_fields``. The UI shows those as AI-derived so the
user can correct them before submitting, because a wrong brand in a lost-item
report actively harms the matching.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

from app.core import preprocess
from app.providers import bge_m3, detector, ocr, siglip, vlm
from app.providers.vlm import config_state as vlm_config_state

log = logging.getLogger("lostlink.item")

AI_FIELDS = (
    "category",
    "itemName",
    "primaryColor",
    "secondaryColor",
    "brand",
    "model",
    "material",
    "shape",
    "size",
    "condition",
    "visibleMark",
    "serialNumber",
    "ocrText",
)

# Colour words we can turn into a real dominant-colour measurement.
_COLOUR_WORDS = (
    "black", "white", "grey", "gray", "silver", "red", "maroon", "crimson",
    "orange", "yellow", "green", "olive", "blue", "navy", "indigo", "purple",
    "violet", "pink", "brown", "beige", "tan", "khaki", "gold",
)

_SERIAL_IN_TEXT = re.compile(
    r"\b(?:sn|serial|model|mdl|part|p\/n)\s*[:#-]?\s*([a-z0-9-]{5,})\b", re.I
)


def _detect_category(name: str) -> str:
    """Map a VLM/detector label onto our category vocabulary."""
    label = (name or "").lower()
    table = {
        "backpack": "Backpack", "rucksack": "Backpack", "handbag": "Handbag",
        "purse": "Handbag", "bottle": "Water Bottle", "flask": "Water Bottle",
        "laptop": "Laptop", "cell phone": "Phone", "mobile phone": "Phone",
        "headphone": "Headphones", "wallet": "Wallet", "key": "Keys",
        "watch": "Watch", "umbrella": "Umbrella", "book": "Books",
        "id card": "ID Card", "glasses": "Glasses", "charger": "Charger",
    }
    for needle, category in table.items():
        if needle in label:
            return category
    return (name or "").strip().title() if name else ""


def _colour_from_text(text: str) -> str:
    for word in _COLOUR_WORDS:
        if re.search(rf"\b{word}\b", (text or "").lower()):
            return word.title()
    return ""


# --------------------------------------------------------------------------
# main entry point
# --------------------------------------------------------------------------
def analyze_item(
    image_bytes: bytes,
    filename: str = "upload.jpg",
    report_type: str = "LOST",
    hints: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Analyse one uploaded image. Never raises on a missing model.

    ``hints`` is whatever the user already typed. We prefer the user's own
    words over a model guess for any field they filled in, and record the
    model's value separately so nothing is silently discarded.
    """
    hints = hints or {}
    image = preprocess.load_image(image_bytes)
    width, height = image.size

    detections: list[dict[str, Any]] = []
    detection_provider = "none"
    primary: Optional[dict[str, Any]] = None
    working_image = image

    # ---- 1. detection + crop -----------------------------------------
    if detector.available():
        try:
            detections = detector.detect(image)
            detection_provider = "yolo26n"
            if detections:
                primary = dict(detections[0])
                primary["is_primary"] = True
                working_image = preprocess.crop_box(image, primary["box"])
        except Exception as exc:  # noqa: BLE001
            log.warning("detection failed: %s", exc)
            detections = []
    else:
        log.info("detector unavailable - analysing the full frame")

    # ---- 2. VLM attributes -------------------------------------------
    vlm_fields: dict[str, Any] = {}
    vlm_used = vlm.available()
    if vlm_used:
        vlm_fields = vlm.extract_attributes(image_bytes)
        if not vlm_fields and primary:
            # Re-run on the detected crop - attribute extraction is far more
            # accurate when the object fills the frame.
            vlm_fields = vlm.extract_attributes(
                _png_bytes(preprocess.crop_box(image, primary["box"]))
            )

    # ---- 3. OCR ------------------------------------------------------
    ocr_result: dict[str, Any] = {"text": "", "lines": [], "serials": []}
    ocr_used = ocr.available()
    if ocr_used:
        try:
            ocr_result = ocr.read(working_image)
        except Exception as exc:  # noqa: BLE001
            log.warning("ocr failed: %s", exc)

    # ---- 4. real pixel statistics ------------------------------------
    statistics = preprocess.image_statistics(working_image)
    colours = preprocess.dominant_colors(working_image)
    shape = preprocess.aspect_shape(*working_image.size)
    serial = (ocr_result.get("serials") or [None])[0]

    # ---- 5. assemble, with user hints winning ------------------------
    # Where each value came from. Recorded as the profile is assembled rather
    # than reconstructed afterwards, so the report can never claim a source that
    # did not actually produce the value.
    provenance: dict[str, dict[str, Any]] = {}

    def pick(field: str, model_value: Any = "") -> Any:
        """User input beats model output; the model fills the blanks.

        Also records the origin of the value, because "the AI extracted this"
        covers four different things here: a vision model, object detection,
        OCR, and pixel statistics.
        """
        user_value = hints.get(field)
        if user_value not in (None, "", []):
            provenance[field] = {
                "source": "user",
                "model_backed": False,
                "detail": "Entered by the reporter; a model did not overwrite it",
            }
            return user_value
        if model_value in (None, "", []):
            provenance[field] = {
                "source": "none",
                "model_backed": False,
                "detail": "Nothing on this image supported a value",
            }
            return ""
        source, model_backed, detail = _source_for(field, vlm_fields, primary, serial)
        provenance[field] = {
            "source": source,
            "model_backed": model_backed,
            "detail": detail,
        }
        return model_value

    model_category = _detect_category(
        str(vlm_fields.get("category") or (primary or {}).get("label") or "")
    )
    description_hint = str(hints.get("description") or hints.get("text") or "")

    item_profile: dict[str, Any] = {
        "itemName": pick("itemName", vlm_fields.get("itemName") or model_category),
        "category": pick("category", model_category),
        "primaryColor": pick(
            "primaryColor",
            vlm_fields.get("primaryColor") or (colours[0] if colours else ""),
        ),
        "secondaryColor": pick(
            "secondaryColor",
            vlm_fields.get("secondaryColor") or (colours[1] if len(colours) > 1 else ""),
        ),
        "brand": pick("brand", vlm_fields.get("brand") or ""),
        "model": pick("model", vlm_fields.get("model") or ""),
        "material": pick("material", vlm_fields.get("material") or ""),
        "shape": pick("shape", vlm_fields.get("shape") or shape),
        "size": pick("size", vlm_fields.get("size") or ""),
        "condition": pick("condition", vlm_fields.get("condition") or ""),
        "visibleMark": pick("visibleMark", vlm_fields.get("visibleMark") or ""),
        "serialNumber": pick("serialNumber", serial or ""),
        "ocrText": ocr_result.get("text", "")[:2000],
    }

    # Filename is a weak but genuinely free signal ("black-backpack-2.jpg").
    if not item_profile["primaryColor"] and filename:
        guessed = _colour_from_text(filename.replace("-", " ").replace("_", " "))
        if guessed:
            item_profile["primaryColor"] = guessed
    if not item_profile["category"] and description_hint:
        item_profile["category"] = _detect_category(description_hint)
        if item_profile["category"]:
            provenance["category"] = {
                "source": "text",
                "model_backed": False,
                "detail": "Matched against the description you typed",
            }

    if report_type == "FOUND":
        item_profile.setdefault("finderNotes", hints.get("finderNotes", ""))

    # ---- 6. which fields are actually AI-derived? --------------------
    ai_fields = [
        field
        for field in AI_FIELDS
        if item_profile.get(field) and hints.get(field) in (None, "", [])
    ]
    item_profile["aiConfidence"] = round(float(vlm_fields.get("confidence") or 0.0), 3)
    item_profile["aiFields"] = ai_fields
    item_profile["analysisVersion"] = _analysis_version(
        vlm_used, ocr_used, detection_provider
    )
    # Kept for the evidence panel / debugging; never shown as a user field.
    item_profile["pixelStats"] = {**statistics, "dominantColors": colours}

    field_sources = {
        field: info
        for field, info in provenance.items()
        if item_profile.get(field) not in (None, "", [])
    }

    return {
        "provider": "vlm" if vlm_used else "heuristic",
        "field_sources": field_sources,
        "signals": _signals(provenance, detection_provider, ocr_used, vlm_used),
        "vlm": {**vlm_config_state(), "status": "ready" if vlm_used else "unavailable"},
        "detection_provider": detection_provider,
        "ocr_provider": "paddleocr" if ocr_used else "none",
        "analysis_version": item_profile["analysisVersion"],
        "confidence": item_profile["aiConfidence"],
        "width": width,
        "height": height,
        "aspect_ratio": round(width / height, 3) if height else None,
        "detections": detections,
        "primary_detection": primary,
        "item_profile": item_profile,
        "ai_fields": ai_fields,
        "ocr_text": ocr_result.get("text", ""),
        "ocr_lines": ocr_result.get("lines", []),
        "notice": _notice(vlm_used, ocr_used, detection_provider),
    }


def _source_for(
    field: str,
    vlm_fields: dict[str, Any],
    primary: Optional[dict[str, Any]],
    serial: Optional[str],
) -> tuple[str, bool, str]:
    """Names the signal that supplied one attribute.

    Mirrors the precedence in `analyze_item`: the vision model first, then object
    detection, then OCR, then pixel statistics. The stage is reported as
    `model_backed=False` because it is a measurement, not model output - saying
    otherwise would make a colour histogram sound like a model judgement.
    """
    if vlm_fields.get(field):
        return "vlm", True, "Read from the photo by the vision model"
    if field in ("category", "itemName") and primary:
        return "detector", True, "From the detected object label"
    if field == "serialNumber":
        return ("ocr", True, "Read from printed text on the item") if serial else (
            "none",
            False,
            "No printed serial was legible",
        )
    if field in ("primaryColor", "secondaryColor"):
        return "pixels", False, "Dominant colour measured from the pixels"
    if field == "shape":
        return "pixels", False, "Derived from the image aspect ratio"
    return "none", False, "Nothing on this image supported a value"


def _signals(
    provenance: dict[str, dict[str, Any]],
    detection_provider: str,
    ocr_used: bool,
    vlm_used: bool,
) -> list[dict[str, Any]]:
    """Groups the per-field origins into one row per contributing signal."""
    providers = {
        "vlm": settings.qwen_model if vlm_used else "not configured",
        "detector": detection_provider,
        "ocr": "paddleocr" if ocr_used else "not installed",
        "pixels": "colour/aspect statistics",
        "user": "reporter input",
    }
    grouped: dict[str, list[str]] = {}
    for field, info in provenance.items():
        grouped.setdefault(info["source"], []).append(field)

    rows: list[dict[str, Any]] = []
    for source, fields in grouped.items():
        rows.append(
            {
                "signal": source,
                "provider": providers.get(source, source),
                "model_backed": bool(provenance[fields[0]].get("model_backed")),
                "fields": sorted(fields),
            }
        )
    # Model-backed signals first, so the UI can show what was actually measured.
    rows.sort(key=lambda r: (not r["model_backed"], r["signal"]))
    return rows


def _analysis_version(vlm_used: bool, ocr_used: bool, detection_provider: str) -> str:
    parts = ["vlm" if vlm_used else "no-vlm"]
    parts.append(detection_provider if detection_provider != "none" else "no-detection")
    parts.append("paddleocr" if ocr_used else "no-ocr")
    return ":".join(parts)


def _notice(vlm_used: bool, ocr_used: bool, detection_provider: str) -> str:
    """Plain-language statement of what was and was not measured."""
    if vlm_used:
        base = "Attributes were read from your photo by the configured vision model. "
    else:
        base = (
            "No vision model is configured, so attributes come from image metadata, "
            "dominant colour and your filename. "
        )
    extras = []
    if detection_provider == "none":
        extras.append("Object detection was unavailable, so the whole frame was analysed.")
    if not ocr_used:
        extras.append("OCR was unavailable, so printed text was not read.")
    return (
        base + " ".join(extras) + " Review and correct any field before submitting."
    ).strip()


def _png_bytes(image: Any) -> bytes:
    import io  # noqa: PLC0415

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()

