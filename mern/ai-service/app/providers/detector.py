"""
YOLO26n object detection provider.

Role in the pipeline: find the actual object in an uploaded photo, and return
the crop that the rest of the pipeline (SigLIP2 / VLM) works on.

IMPORTANT — licence
-------------------
Ultralytics documents YOLO26 under AGPL-3.0 with a separate Enterprise licence.
AGPL has real obligations if you ship this as a hosted product. For a hackathon
or internal deployment that is fine; before commercialising, either buy the
Enterprise licence or swap this provider for a permissively licensed detector
(MMDetection / RT-DETR are the usual substitutes). The class is isolated here
precisely so that swap is a one-file change.

Graceful degradation
--------------------
If ultralytics or the weights are unavailable, ``available()`` is False and
the caller falls back to using the whole image as the "item crop". The service
still runs; it just loses detection.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from app.core.config import settings
from app.providers.base import LazyProvider, register

log = logging.getLogger("lostlink.providers.detector")


class YoloDetector(LazyProvider):
    name = "detector"
    model_id = settings.yolo_model

    def _load(self) -> Any:
        try:
            from ultralytics import YOLO  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError(
                "ultralytics is not installed - run: pip install -r requirements-ml.txt"
            ) from exc

        model = YOLO(self.model_id)
        # move() is a no-op on CPU and does the right thing when a GPU appears.
        try:
            model.to(settings.resolved_device)
        except Exception:  # noqa: BLE001 - older ultralytics without .to()
            pass
        return model

    # ------------------------------------------------------------------
    def detect(self, image: Any) -> list[dict[str, Any]]:
        """Run detection on a PIL/numpy image.

        Returns a list of dicts sorted by area descending, each with
        ``label``, ``confidence``, ``box`` ([x1,y1,x2,y2] pixels) and
        ``area_ratio`` (fraction of the full frame).
        """
        model = self.require()
        results = model.predict(
            image,
            conf=settings.yolo_confidence,
            iou=settings.yolo_iou,
            verbose=False,
        )
        if not results:
            return []

        raw = results[0]
        boxes = getattr(raw, "boxes", None)
        if boxes is None or len(boxes) == 0:
            return []

        names = getattr(raw, "names", {}) or {}
        # ultralytics >=8.3 exposes `orig_shape` as (height, width) and no
        # longer has `orig_size`. Support both so an upgrade cannot silently
        # disable detection.
        orig_size = getattr(raw, "orig_size", None)
        if orig_size is None:
            shape = getattr(raw, "orig_shape", None)
            if shape is not None:
                orig_size = (shape[1], shape[0])  # -> (w, h)
        if orig_size is None:
            image = getattr(raw, "orig_img", None)
            orig_size = (image.shape[1], image.shape[0]) if image is not None else (0, 0)
        width, height = orig_size

        out: list[dict[str, Any]] = []
        for box in boxes:
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
            area_ratio = max(0.0, ((x2 - x1) * (y2 - y1)) / max(1, width * height))
            if area_ratio < settings.yolo_min_box_area:
                continue
            cls = int(box.cls[0].item())
            out.append(
                {
                    "label": str(names.get(cls, cls)),
                    "confidence": round(float(box.conf[0].item()), 4),
                    "box": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                    "area_ratio": round(area_ratio, 4),
                }
            )

        out.sort(key=lambda d: d["area_ratio"], reverse=True)
        return out

    def track(self, video_path: str, sample_fps: float = 0.5) -> list[dict[str, Any]]:
        """Run ByteTrack/BoT-SORT over a video.

        Ultralytics exposes tracking through ``model.track(..., persist=True)``
        with the tracker selectable per call. We use ``bytetrack.yaml`` as the
        baseline (faster, no appearance model) and fall back to ``botsort.yaml``
        when the former is missing. Note: this is item tracking, never face
        recognition.
        """
        model = self.require()
        last_error: Optional[Exception] = None
        for tracker in ("bytetrack.yaml", "botsort.yaml"):
            try:
                results = model.track(
                    video_path,
                    tracker=tracker,
                    persist=True,
                    conf=settings.yolo_confidence,
                    iou=settings.yolo_iou,
                    verbose=False,
                )
                return self._collect_tracks(results)
            except Exception as exc:  # noqa: BLE001 - try the next tracker
                last_error = exc
                log.warning("tracker %s failed: %s", tracker, exc)
        log.warning("video tracking unavailable: %s", last_error)
        return []

    @staticmethod
    def _collect_tracks(results: Any) -> list[dict[str, Any]]:
        """Flatten ultralytics tracking output into per-frame observations."""
        names: dict[int, str] = {}
        observations: list[dict[str, Any]] = []
        for frame_index, frame in enumerate(results):
            boxes = getattr(frame, "boxes", None)
            if boxes is None or len(boxes) == 0:
                continue
            names = getattr(frame, "names", names) or {}
            ids = getattr(boxes, "id", None)
            for i in range(len(boxes)):
                x1, y1, x2, y2 = (float(v) for v in boxes.xyxy[i].tolist())
                cls = int(boxes.cls[i].item())
                observations.append(
                    {
                        "frame": frame_index,
                        "track_id": int(ids[i].item()) if ids is not None else None,
                        "label": str(names.get(cls, cls)),
                        "confidence": round(float(boxes.conf[i].item()), 4),
                        "box": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                    }
                )
        return observations


detector = register(YoloDetector())
