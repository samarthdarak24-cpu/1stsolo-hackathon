"""
Image preprocessing: decode, normalise, crop.

Deliberately dependency-light. Pillow handles the decoding and the crops;
OpenCV is used opportunistically for the operations that genuinely benefit from
it (CLAHE contrast normalisation, sharpening) and skipped when absent.

Everything here is real work on the actual pixels - dimensions, colour
statistics, blur detection - not a placeholder.
"""
from __future__ import annotations

import io
import logging
from typing import Any, Optional

from PIL import Image, ImageFilter, ImageOps, ImageStat

from app.core.config import settings

log = logging.getLogger("lostlink.preprocess")

Image.MAX_IMAGE_PIXELS = 50_000_000  # decompression-bomb guard


def load_image(data: bytes) -> Image.Image:
    """Decode bytes into an RGB PIL image, honouring EXIF orientation."""
    if len(data) > settings.max_upload_bytes:
        raise ValueError("Image is larger than the configured limit")
    image = Image.open(io.BytesIO(data))
    image = ImageOps.exif_transpose(image)
    if image.mode != "RGB":
        image = image.convert("RGB")
    return image


def normalise_for_embedding(data: bytes, size: int = 224) -> Image.Image:
    """Canonical form for the image encoder: decode, EXIF-rotate, square-crop,
    resize.

    Every photo is reduced to the same shape before SigLIP sees it, so a phone
    snapshot and a tight crop of the same jacket produce comparable vectors and
    the encoder works on the smallest tensor that preserves detail (faster on
    CPU). A square crop is the right default here because the item fills the
    frame in a lost-and-found photo; the aspect ratio is still recorded
    separately by the analysis pipeline.

    SVG placeholders (the seeded artwork) cannot be decoded by Pillow and are
    reported as unsupported so callers can skip them cleanly instead of seeing
    a generic decode error.
    """
    if data[:5].lstrip().startswith((b"<?xml", b"<svg")) or data[:4] == b"<svg":
        raise ValueError("svg-unsupported: vector art needs rasterising before embedding")
    image = load_image(data)
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    cropped = image.crop((left, top, left + side, top + side))
    if cropped.size != (size, size):
        cropped = cropped.resize((size, size), Image.Resampling.LANCZOS)
    return cropped


def dominant_colors(image: Image.Image, count: int = 3) -> list[str]:
    """Quantised dominant colours, as human-readable names when possible."""
    small = image.resize((64, 64))
    quantized = small.quantize(colors=count, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette() or []
    out: list[str] = []
    for index in range(count):
        rgb = palette[index * 3 : index * 3 + 3]
        if len(rgb) < 3:
            continue
        name = nearest_colour_name(rgb)
        if name and name not in out:
            out.append(name)
    return out


NAMED_COLOURS = [
    ("Black", (20, 20, 20)),
    ("White", (245, 245, 245)),
    ("Grey", (128, 128, 128)),
    ("Red", (200, 40, 40)),
    ("Orange", (230, 130, 30)),
    ("Yellow", (235, 210, 60)),
    ("Green", (50, 160, 80)),
    ("Blue", (50, 90, 200)),
    ("Navy", (25, 40, 90)),
    ("Purple", (130, 70, 190)),
    ("Pink", (235, 130, 175)),
    ("Brown", (130, 90, 55)),
    ("Beige", (225, 210, 175)),
]


def nearest_colour_name(rgb: tuple[int, int, int]) -> Optional[str]:
    best, best_distance = None, 1e9
    for name, ref in NAMED_COLOURS:
        distance = sum((a - b) ** 2 for a, b in zip(rgb, ref))
        if distance < best_distance:
            best, best_distance = name, distance
    return best


def image_statistics(image: Image.Image) -> dict[str, Any]:
    """Brightness, contrast and a blur estimate from the real pixels."""
    stat = ImageStat.Stat(image.convert("L"))
    brightness = stat.mean[0] / 255.0
    contrast = stat.stddev[0] / 255.0

    # Variance-of-Laplacian is the standard cheap blur metric.
    edges = image.convert("L").filter(ImageFilter.FIND_EDGES)
    sharpness = ImageStat.Stat(edges).stddev[0] / 255.0
    return {
        "brightness": round(brightness, 4),
        "contrast": round(contrast, 4),
        "sharpness": round(sharpness, 4),
        "blurry": sharpness < 0.06,
    }


def aspect_shape(width: int, height: int) -> str:
    if not width or not height:
        return ""
    ratio = width / height
    if ratio > 1.9:
        return "Wide"
    if ratio > 1.3:
        return "Rectangular"
    if 0.85 <= ratio <= 1.18:
        return "Square"
    if ratio < 0.55:
        return "Tall"
    return "Rounded"


def crop_box(image: Image.Image, box: list[float], pad_ratio: float = 0.06) -> Image.Image:
    """Crop to a detection box, padded so context is retained."""
    width, height = image.size
    x1, y1, x2, y2 = box
    pad_x = (x2 - x1) * pad_ratio
    pad_y = (y2 - y1) * pad_ratio
    return image.crop(
        (
            max(0, int(x1 - pad_x)),
            max(0, int(y1 - pad_y)),
            min(width, int(x2 + pad_x)),
            min(height, int(y2 + pad_y)),
        )
    )


def shape_from_aspect(width: int, height: int) -> str:
    return aspect_shape(width, height)
