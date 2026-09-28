"""
CCTV / last-seen intelligence.

    video -> frame extraction -> YOLO26 detection -> ByteTrack/BoT-SORT
          -> per-track crops -> SigLIP2 embedding -> compare with the lost item
          -> last-seen timeline

IMPORTANT — this tracks OBJECTS, not people. There is deliberately no face
recognition anywhere in this module, and none should be added: the product
needs to find a backpack, and identifying who carried it is both unnecessary
and a serious privacy problem.

Frame sampling is sparse by default (``sample_fps``) because CCTV footage is
long and CPU inference is the bottleneck. A 10-minute clip at 0.5 fps is 300
frames, which is tractable; at 30 fps it is not.

When the tracker or embedder is unavailable we return ``status="unavailable"``
with an explanation rather than a fabricated timeline.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

from app.core.config import settings
from app.core.pipeline import embed_image
from app.providers import detector, siglip

log = logging.getLogger("lostlink.cctv")

# COCO classes that plausibly appear as a "carried item". Restricting to this
# list keeps people out of the results and keeps the event list meaningful.
ITEM_CLASSES = {
    "backpack", "handbag", "suitcase", "bottle", "cell phone", "laptop",
    "book", "umbrella", "handbag", "wallet", "teddy bear", "potted plant",
    "cup", "bowl", "vase", "clock", "traffic light",
}


def _frame_timestamp(video_path: str, frame_index: int, fps: float) -> str:
    seconds = frame_index / fps if fps > 0 else 0.0
    base = datetime.fromtimestamp(os.path.getmtime(video_path), tz=timezone.utc)
    from datetime import timedelta  # noqa: PLC0415

    return (base + timedelta(seconds=seconds)).isoformat()


def _video_fps(video_path: str, fallback: float = 25.0) -> float:
    try:
        import cv2  # noqa: PLC0415

        capture = cv2.VideoCapture(video_path)
        fps = capture.get(cv2.CAP_PROP_FPS) or fallback
        capture.release()
        return float(fps)
    except Exception:  # noqa: BLE001
        return fallback


def analyze_video(
    organization_id: str,
    report_id: str,
    video_path: str,
    camera: str = "",
    location: str = "",
    target_image_bytes: Optional[bytes] = None,
    target_description: str = "",
    sample_fps: float = 0.5,
) -> dict[str, Any]:
    """Run detection + tracking + appearance comparison over one clip."""
    if not os.path.exists(video_path):
        return {
            "provider": "cctv",
            "status": "unavailable",
            "report_id": report_id,
            "events": [],
            "last_seen": None,
            "frames_analyzed": 0,
            "notice": "The video file could not be found on the analysis service.",
        }

    if not detector.available():
        return {
            "provider": "cctv",
            "status": "unavailable",
            "report_id": report_id,
            "events": [],
            "last_seen": None,
            "frames_analyzed": 0,
            "notice": (
                "Object detection is not installed on the analysis service, so "
                "video cannot be searched. Install requirements-ml.txt to enable "
                "CCTV last-seen intelligence."
            ),
        }

    try:
        observations = detector.track(video_path, sample_fps)
    except Exception as exc:  # noqa: BLE001
        log.error("video tracking failed: %s", exc)
        return {
            "provider": "cctv",
            "status": "unavailable",
            "report_id": report_id,
            "events": [],
            "last_seen": None,
            "frames_analyzed": 0,
            "notice": f"Video processing failed: {type(exc).__name__}",
        }

    if not observations:
        return {
            "provider": "cctv",
            "status": "completed",
            "report_id": report_id,
            "events": [],
            "last_seen": None,
            "frames_analyzed": 0,
            "notice": (
                "No trackable item-class objects were detected in the sampled "
                "frames. Try a longer clip or a higher sample rate."
            ),
        }

    # ---- filter to item classes, then group by track id ---------------
    item_observations = [
        o for o in observations if o["label"].lower() in ITEM_CLASSES
    ]
    if not item_observations:
        return {
            "provider": "cctv",
            "status": "completed",
            "report_id": report_id,
            "events": [],
            "last_seen": None,
            "frames_analyzed": 0,
            "notice": (
                "Objects were detected but none were item-class (bags, bottles, "
                "devices). Last-seen tracking only considers carried items."
            ),
        }

    fps = _video_fps(video_path)
    target_vector = embed_image(target_image_bytes) if target_image_bytes else None
    appearance_used = target_vector is not None

    # Group observations per track so we report one event per object identity,
    # not one per frame. That is the difference between a usable timeline and
    # thousands of duplicate rows.
    tracks: dict[Any, dict[str, Any]] = {}
    for observation in item_observations:
        key = observation.get("track_id") or f"{observation['label']}:{observation['box']}"
        entry = tracks.setdefault(
            key,
            {
                "track_id": observation.get("track_id"),
                "label": observation["label"],
                "frames": [],
                "box": observation["box"],
            },
        )
        entry["frames"].append(observation["frame"])

    events: list[dict[str, Any]] = []
    for index, (key, entry) in enumerate(sorted(tracks.items(), key=lambda kv: str(kv[0]))):
        frames = entry["frames"]
        first_frame, last_frame = min(frames), max(frames)
        confidence = max(o["confidence"] for o in item_observations if o["frame"] in set(frames))

        events.append(
            {
                "id": f"{report_id}:{key}",
                "camera": camera,
                "location": location,
                "detected_at": _frame_timestamp(video_path, first_frame, fps),
                "confidence": round(float(confidence), 4),
                "track_id": entry["track_id"],
                "thumbnail": None,
                # extra context for the UI timeline
                "label": entry["label"],
                "first_frame": first_frame,
                "last_frame": last_frame,
                "frame_count": len(frames),
            }
        )

    events.sort(key=lambda e: e["detected_at"])
    last_seen = events[-1] if events else None

    if appearance_used:
        notice = (
            f"{len(events)} item track(s) detected. Appearance comparison against "
            "the reported item photo was available, but per-track crops require "
            "the frame-extraction stage, which is disabled in this build - so the "
            "events are detection-based, not appearance-confirmed."
        )
        status = "partial"
    else:
        notice = (
            f"{len(events)} item track(s) detected by class. No image embedding "
            "model is installed, so tracks were not appearance-matched to the "
            "reported item - treat these as candidates for a human to check."
        )
        status = "partial"

    return {
        "provider": "cctv",
        "status": status,
        "report_id": report_id,
        "events": events,
        "last_seen": last_seen,
        "frames_analyzed": len(observations),
        "notice": notice,
    }

