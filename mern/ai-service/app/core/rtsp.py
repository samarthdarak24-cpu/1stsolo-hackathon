"""
Live camera ingest over RTSP — opt-in, and off by default.

Nothing in this build subscribes to a camera. Uploading a clip that already
exists on the analysis host is the supported path (see `core/cctv.py`), and that
is deliberate: connecting to an organisation's camera network is a deployment
decision with privacy and network consequences, not something a clone-and-run
should do silently.

So RTSP lives behind `RTSP_ENABLED`, and every path here says exactly which
state it is in. Sample the stream, run the SAME object detector over the frames,
and return the same event shape as a clip search. Two rules carry over
unchanged and are restated in every response:

  * object tracking only - no frame is ever passed to face recognition, and no
    person identity is derived from the footage;
  * no tracker runs across sampled frames, so events are per-frame candidates,
    not one identity followed through time. Pretending otherwise would be
    inventing a timeline.

The URL is also treated as untrusted input: `file://`, `http://` and friends are
rejected outright, so this endpoint cannot be used as a generic SSRF gadget to
read local files or reach internal HTTP services.
"""
from __future__ import annotations

import logging
import os
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlparse

from app.core.config import settings
from app.providers import detector

log = logging.getLogger("lostlink.rtsp")

ALLOWED_SCHEMES = ("rtsp", "rtsps")
METHODOLOGY = (
    "Object detection over sampled frames only. No face recognition, no person "
    "identity, and no tracking across frames."
)


def cv2_available() -> bool:
    """Is an OpenCV build with video I/O actually importable here?"""
    try:
        import cv2  # noqa: F401,PLC0415

        return True
    except Exception:  # noqa: BLE001
        return False


def capability() -> dict[str, Any]:
    """What this deployment can do about live cameras, without connecting to one.

    Reported on /health so an operator can tell "switched off" from "turned on
    but missing its dependency" - they need different fixes.
    """
    enabled = bool(settings.rtsp_enabled)
    have_cv2 = cv2_available()
    allowlist = [h.strip() for h in str(settings.rtsp_allowed_hosts or "").split(",") if h.strip()]

    if not enabled:
        notice = (
            "Live camera ingest is switched off (RTSP_ENABLED=false). Upload a clip "
            "to the analysis host to search footage."
        )
    elif not have_cv2:
        notice = (
            "Live camera ingest is enabled but OpenCV is not installed, so no "
            "stream can be opened. Install requirements-ml.txt to enable it."
        )
    elif not allowlist:
        notice = (
            "Live camera ingest is enabled with no host allowlist. Any reachable "
            "RTSP host may be requested; set RTSP_ALLOWED_HOSTS to restrict it."
        )
    else:
        notice = (
            "Live camera ingest is enabled and restricted to "
            f"{len(allowlist)} allowed host(s)."
        )

    return {
        "enabled": enabled,
        "available": enabled and have_cv2,
        "cv2_installed": have_cv2,
        "allowlist_configured": bool(allowlist),
        "notice": notice,
        "methodology": METHODOLOGY,
    }


def assert_usable(url: str) -> str:
    """Validates the stream URL, or raises ValueError with a stated reason."""
    state = capability()
    if not state["enabled"]:
        raise ValueError(
            "Live camera ingest is not enabled on this server (RTSP_ENABLED=false). "
            "Upload a clip instead, or enable it in the deployment configuration."
        )
    if not state["cv2_installed"]:
        raise ValueError(
            "Live camera ingest is enabled but OpenCV is not installed on the "
            "analysis host, so no RTSP stream can be opened."
        )

    parsed = urlparse(str(url or "").strip())
    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise ValueError(
            "Only rtsp:// and rtsps:// URLs are accepted; "
            f"{parsed.scheme or 'that'} URLs are rejected."
        )
    if not parsed.hostname:
        raise ValueError("The RTSP URL has no host.")

    allowlist = [h.strip().lower() for h in str(settings.rtsp_allowed_hosts or "").split(",") if h.strip()]
    if allowlist and parsed.hostname.lower() not in allowlist:
        raise ValueError(
            f"The camera host {parsed.hostname} is not in RTSP_ALLOWED_HOSTS."
        )
    return url


def sample_frames(
    url: str,
    seconds: float = 30.0,
    sample_fps: float = 0.5,
) -> tuple[list[dict[str, Any]], float]:
    """Grabs a sparse set of frames from a live stream.

    Returns ``(frames, nominal_fps)``. Bounded in both time and frame count: a
    live stream never ends, so a caller that asks for too much would otherwise
    hold a worker forever.
    """
    import cv2  # noqa: PLC0415

    limit_seconds = min(float(seconds or 0) or settings.rtsp_max_seconds, settings.rtsp_max_seconds)
    fps = max(0.05, float(sample_fps or 0) or 0.5)
    max_frames = int(settings.rtsp_max_frames)

    capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
    if not capture.isOpened():
        raise ValueError(
            "The analysis host could not open that stream. Check the URL, the "
            "credentials in it, and that the camera is reachable from the server."
        )

    workdir = tempfile.mkdtemp(prefix="lostlink-rtsp-")
    frames: list[dict[str, Any]] = []
    interval = 1.0 / fps
    started = datetime.now(tz=timezone.utc)
    try:
        # Sample on a wall-clock schedule rather than by frame index: a live
        # stream delivers frames at its own rate, so "every Nth frame" is not a
        # fixed time step.
        next_at = 0.0
        elapsed = 0.0
        skipped = 0
        while elapsed <= limit_seconds and len(frames) < max_frames:
            ok, frame = capture.read()
            if not ok:
                break
            elapsed = (datetime.now(tz=timezone.utc) - started).total_seconds()
            if elapsed < next_at:
                skipped += 1
                continue
            next_at = elapsed + interval
            path = os.path.join(workdir, f"frame-{len(frames):05d}.jpg")
            cv2.imwrite(path, frame)
            frames.append({"path": path, "seconds": round(elapsed, 2), "at": started + timedelta(seconds=elapsed)})
    finally:
        capture.release()

    return frames, fps


def analyze_stream(
    organization_id: str,
    report_id: str,
    rtsp_url: str,
    camera: str = "",
    location: str = "",
    seconds: float = 30.0,
    sample_fps: float = 0.5,
) -> dict[str, Any]:
    """Samples a live stream and reports detected item-class objects.

    Returns the same shape as `core.cctv.analyze_video`, with the honest caveat
    that frames were sampled from a live feed rather than tracked through a clip.
    """
    try:
        url = assert_usable(rtsp_url)
    except ValueError as exc:
        # A refusal is a normal outcome here, not a crash: the caller gets the
        # stated reason and the product keeps working without cameras.
        return {
            "provider": "cctv-rtsp",
            "status": "unavailable",
            "report_id": report_id,
            "events": [],
            "last_seen": None,
            "frames_analyzed": 0,
            "notice": str(exc),
        }

    if not detector.available():
        return {
            "provider": "cctv-rtsp",
            "status": "unavailable",
            "report_id": report_id,
            "events": [],
            "last_seen": None,
            "frames_analyzed": 0,
            "notice": (
                "Object detection is not installed on the analysis service, so a "
                "live stream cannot be searched."
            ),
        }

    # Imported here to keep the module importable without the optional extras.
    from app.core.cctv import ITEM_CLASSES  # noqa: PLC0415
    from app.core import preprocess  # noqa: PLC0415

    workdir = None
    try:
        frames, _fps = sample_frames(url, seconds=seconds, sample_fps=sample_fps)
        workdir = os.path.dirname(frames[0]["path"]) if frames else None

        if not frames:
            return {
                "provider": "cctv-rtsp",
                "status": "unavailable",
                "report_id": report_id,
                "events": [],
                "last_seen": None,
                "frames_analyzed": 0,
                "notice": (
                    "The stream opened but delivered no readable frames. Check that "
                    "the camera is still transmitting."
                ),
            }

        events: list[dict[str, Any]] = []
        analysed = 0
        for entry in frames:
            try:
                with open(entry["path"], "rb") as handle:
                    image = preprocess.load_image(handle.read())
            except Exception as exc:  # noqa: BLE001
                log.warning("sampled frame could not be decoded: %s", exc)
                continue
            analysed += 1
            try:
                detections = detector.detect(image)
            except Exception as exc:  # noqa: BLE001
                log.warning("detection failed on a live frame: %s", exc)
                continue

            for index, detection in enumerate(detections):
                if str(detection.get("label", "")).lower() not in ITEM_CLASSES:
                    continue
                events.append(
                    {
                        "id": f"{report_id}:{camera or 'live'}:{entry['seconds']}:{index}",
                        "camera": camera,
                        "location": location,
                        "detected_at": entry["at"].isoformat(),
                        # No tracker across sampled frames, so there is no track
                        # identity to report - each row is one frame's sighting.
                        "track_id": None,
                        "thumbnail": None,
                        "confidence": round(float(detection.get("confidence") or 0.0), 4),
                        "label": detection.get("label", ""),
                        "frame_count": 1,
                    }
                )
    except ValueError as exc:
        return {
            "provider": "cctv-rtsp",
            "status": "unavailable",
            "report_id": report_id,
            "events": [],
            "last_seen": None,
            "frames_analyzed": 0,
            "notice": str(exc),
        }
    except Exception as exc:  # noqa: BLE001
        log.error("live stream analysis failed: %s", exc)
        return {
            "provider": "cctv-rtsp",
            "status": "unavailable",
            "report_id": report_id,
            "events": [],
            "last_seen": None,
            "frames_analyzed": 0,
            "notice": f"Live stream processing failed: {type(exc).__name__}",
        }
    finally:
        if workdir:
            shutil.rmtree(workdir, ignore_errors=True)

    events.sort(key=lambda e: e["detected_at"])
    last_seen: Optional[dict[str, Any]] = events[-1] if events else None

    if not events:
        notice = (
            f"No item-class objects were detected in {len(frames)} sampled frame(s) "
            f"over {minutes(seconds)}. Try a longer window or a higher sample rate."
        )
        status = "completed"
    else:
        labels = sorted({e["label"] for e in events})
        notice = (
            f"{len(events)} detection(s) of {', '.join(labels)} across {analysed} "
            "sampled frame(s) from the live stream. These are per-frame sightings "
            "of item-class objects - a person may be carrying the same item in "
            "another frame, so treat them as candidates for a human to check."
        )
        # Never "completed": these are sightings from sampled frames, so a human
        # still has to decide whether any of them is the item.
        status = "partial"

    return {
        "provider": "cctv-rtsp",
        "status": status,
        "report_id": report_id,
        "events": events,
        "last_seen": last_seen,
        "frames_analyzed": analysed,
        "notice": notice,
    }


def minutes(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:g} seconds"
    return f"{seconds / 60:.1f} minutes"
