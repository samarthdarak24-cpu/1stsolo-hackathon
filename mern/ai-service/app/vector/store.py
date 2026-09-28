"""
Vector store â€” Qdrant with a mandatory organizationId payload filter.

Tenant isolation is enforced HERE, at the query level, not in application code.
Every search call requires an ``organization_id`` and puts it in the Qdrant
filter, so a bug in a caller cannot cause cross-tenant retrieval. This is the
single most important invariant in the AI layer: a student at one school
searching for a backpack must never see vectors belonging to another company,
even though both may be "black backpacks".

Payload stored per point
------------------------
    organization_id  (indexed, required)
    report_id, report_type, category, location, created_at, model

Fallback ladder
---------------
Qdrant is addressed through three tiers, tried in order:

1. ``qdrant`` - a Qdrant server at ``QDRANT_URL``.
2. ``qdrant-local`` - Qdrant's own on-disk mode at ``QDRANT_LOCAL_PATH``. Same
   client API, same payload filtering, but the engine writes to local storage,
   so the index survives a restart with no infrastructure to install.
3. ``in-memory`` - a per-process index. Not durable; ``/health`` reports it so
   operators can see the service is degraded. Dev/demo only, never production.

Tier 2 exists because "clone and run" must not silently lose every embedding
whenever the process restarts; tier 3 is only for the case where even the local
engine cannot start (for example a read-only working directory).
"""
from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from typing import Any, Optional

from app.core.config import settings

log = logging.getLogger("lostlink.vector")

NAMESPACE_IMAGE = "image"
NAMESPACE_TEXT = "text"

# Modes that speak the Qdrant client protocol (server plus local on-disk).
QDRANT_MODES = ("qdrant", "qdrant-local")


def _cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity in pure Python.

    Qdrant does this server-side; this only serves the fallback index, where the
    candidate set is small, so a numpy-free loop keeps the core install light.
    """
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = na = nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / ((na**0.5) * (nb**0.5))


class _MemoryIndex:
    """Minimal brute-force index used only when Qdrant is unavailable."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._points: dict[str, list[dict[str, Any]]] = {
            NAMESPACE_IMAGE: [],
            NAMESPACE_TEXT: [],
        }

    def upsert(self, namespace: str, points: list[dict[str, Any]]) -> None:
        with self._lock:
            bucket = self._points.setdefault(namespace, [])
            ids = {p["report_id"] for p in points}
            self._points[namespace] = [
                p for p in bucket if p["report_id"] not in ids
            ] + points

    def search(
        self, namespace: str, vector: list[float], organization_id: str, limit: int
    ) -> list[dict[str, Any]]:
        with self._lock:
            bucket = list(self._points.get(namespace, []))
        # Tenant filter first, always.
        scoped = [p for p in bucket if p.get("organization_id") == organization_id]
        for point in scoped:
            point["score"] = _cosine(vector, point.get("vector") or [])
        scoped.sort(key=lambda p: p["score"], reverse=True)
        return scoped[:limit]

    def delete(self, namespace: str, organization_id: str, report_id: str) -> None:
        with self._lock:
            self._points[namespace] = [
                p
                for p in self._points.get(namespace, [])
                if not (
                    p.get("organization_id") == organization_id
                    and p.get("report_id") == report_id
                )
            ]

    def clear(self) -> None:
        with self._lock:
            self._points = {NAMESPACE_IMAGE: [], NAMESPACE_TEXT: []}


class VectorStore:
    """Qdrant-backed store with transparent in-memory fallback."""

    def __init__(self) -> None:
        self._client: Any = None
        self._fallback = _MemoryIndex()
        self._mode = "unknown"  # qdrant | qdrant-local | in-memory | unavailable | unknown
        self._lock = threading.Lock()
        # Self-healing state. A single failed query used to set the mode to
        # "in-memory" for the REST OF THE PROCESS, because connect() returned
        # early for any mode other than "unknown". In practice one transient
        # Qdrant error therefore (a) silently gave up durability and (b) sent
        # every later match run to a near-empty per-process index, which is why
        # matches came back with tiny scores and proxy signals. Now a failure
        # degrades only until a retry window elapses, and the tier is reported
        # honestly while it lasts.
        self._degraded_from: Optional[str] = None
        self._last_error: Optional[str] = None
        self._degrade_count = 0
        self._retry_at = 0.0

    @property
    def mode(self) -> str:
        return self._mode

    def _degrade(self, exc: Exception) -> None:
        """Step down to the in-memory index, but only until the next retry."""
        with self._lock:
            self._degraded_from = self._mode if self._mode in QDRANT_MODES else self._degraded_from
            self._degrade_count += 1
            self._last_error = f"{type(exc).__name__}: {exc}"
            self._mode = "in-memory"
            self._retry_at = time.monotonic() + settings.vector_retry_seconds
        log.warning(
            "vector store degraded to in-memory for %.0fs (%s); will retry the "
            "durable tier",
            settings.vector_retry_seconds,
            self._last_error,
        )

    def describe(self) -> dict[str, Any]:
        """Honest tier report for /health and the analysis version string."""
        return {
            "mode": self._mode,
            "durable": self._mode in QDRANT_MODES,
            "degraded": self._mode == "in-memory",
            "degraded_from": self._degraded_from,
            "degrade_count": self._degrade_count,
            "last_error": self._last_error,
        }

    def connect(self) -> str:
        """Try Qdrant; fall back if allowed. Never raises."""
        with self._lock:
            if self._mode in QDRANT_MODES or self._mode == "unavailable":
                return self._mode
            # "unknown" (first call) or a degraded mode whose retry window has
            # elapsed: try the durable tiers again.
            if self._mode == "in-memory" and time.monotonic() < self._retry_at:
                return self._mode
            server_error: Optional[Exception] = None
            try:
                from qdrant_client import QdrantClient  # noqa: PLC0415

                client = QdrantClient(
                    url=settings.qdrant_url,
                    api_key=settings.qdrant_api_key or None,
                    timeout=5,
                )
                client.get_collections()  # fail fast if unreachable
                self._client = client
                self._mode = "qdrant"
                self._degraded_from = None
                log.info("connected to Qdrant at %s", settings.qdrant_url)
                return self._mode
            except Exception as exc:  # noqa: BLE001
                server_error = exc

            if not settings.allow_vector_fallback:
                self._mode = "unavailable"
                log.error("Qdrant unavailable and fallback disabled: %s", server_error)
                return self._mode

            # Tier 2: Qdrant's local on-disk engine. Durable, no server needed.
            try:
                from qdrant_client import QdrantClient  # noqa: PLC0415

                path = os.path.abspath(settings.qdrant_local_path)
                os.makedirs(path, exist_ok=True)
                client = QdrantClient(path=path)
                client.get_collections()  # proves the local engine really opened
                self._client = client
                self._mode = "qdrant-local"
                self._degraded_from = None
                log.warning(
                    "Qdrant server unavailable (%s) - using the local on-disk "
                    "index at %s. Embeddings persist across restarts.",
                    server_error,
                    path,
                )
                return self._mode
            except Exception as local_exc:  # noqa: BLE001
                # Tier 3: last resort, loses everything on restart.
                self._mode = "in-memory"
                log.warning(
                    "Local on-disk Qdrant unavailable (%s) - using the "
                    "in-process index. Not durable; fine for demos, not for "
                    "production.",
                    local_exc,
                )
                return self._mode

    def ensure_collection(self, namespace: str, dim: int) -> None:
        """Create the collection and the organization_id index on first use.

        A collection pinned to the WRONG dimension is worse than none: it makes
        every search fail (vector shapes do not align), which quietly degraded
        the whole service to the in-memory tier. That state is only reachable
        through test probes or a model change, and in both cases the stored
        vectors are unusable by definition - so recreate rather than keep a
        collection no query can ever succeed against.
        """
        if self._mode not in QDRANT_MODES:
            return
        from qdrant_client.models import Distance, VectorParams  # noqa: PLC0415

        try:
            if self._client.collection_exists(namespace):
                info = self._client.get_collection(namespace)
                existing = None
                params = getattr(info.config, "params", None)
                vectors = getattr(params, "vectors", None)
                if isinstance(vectors, int):
                    existing = vectors
                elif vectors is not None:
                    existing = getattr(vectors, "size", None)
                if existing and existing != dim:
                    log.warning(
                        "collection %s has dim %s but %s vectors need dim %s - "
                        "recreating (stored vectors were unusable)",
                        namespace,
                        existing,
                        namespace,
                        dim,
                    )
                    self._client.delete_collection(namespace)
            if not self._client.collection_exists(namespace):
                self._client.create_collection(
                    collection_name=namespace,
                    vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
                )
            self._ensure_org_index(namespace)
        except Exception as exc:  # noqa: BLE001
            log.warning("collection setup failed for %s: %s", namespace, exc)

    def _ensure_org_index(self, namespace: str) -> None:
        """Index organization_id so the tenant filter is fast, not just correct.

        Server mode only: the local engine has no payload indexes and says so
        with a warning on every call.
        """
        if self._mode != "qdrant":
            return
        from qdrant_client.models import PayloadSchemaType  # noqa: PLC0415

        try:
            self._client.create_payload_index(
                collection_name=namespace,
                field_name="organization_id",
                field_schema=PayloadSchemaType.KEYWORD,
            )
        except Exception:  # noqa: BLE001 - the index usually already exists
            pass

    # ------------------------------------------------------------------
    def upsert(
        self,
        namespace: str,
        organization_id: str,
        entries: list[dict[str, Any]],
    ) -> int:
        """entries: [{report_id, vector, report_type, category, location, ...}]"""
        if not entries or not organization_id:
            return 0
        dim = len(entries[0].get("vector") or [])
        if dim == 0:
            return 0

        if self.connect() in QDRANT_MODES:
            from qdrant_client.models import PointStruct  # noqa: PLC0415

            self.ensure_collection(namespace, dim)
            points = []
            for entry in entries:
                # Deterministic id so re-embedding a report REPLACES its old
                # vector instead of accumulating duplicates.
                point_id = str(
                    uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        f"{organization_id}:{namespace}:{entry['report_id']}",
                    )
                )
                points.append(
                    PointStruct(
                        id=point_id,
                        vector=entry["vector"],
                        payload={
                            "organization_id": organization_id,  # never optional
                            "report_id": entry["report_id"],
                            "report_type": entry.get("report_type", ""),
                            "category": entry.get("category", ""),
                            "location": entry.get("location", ""),
                            "model": entry.get("model", ""),
                            "created_at": entry.get("created_at"),
                        },
                    )
                )
            try:
                self._client.upsert(collection_name=namespace, points=points)
                return len(points)
            except Exception as exc:  # noqa: BLE001
                log.error("qdrant upsert failed, falling back: %s", exc)
                self._degrade(exc)

        for entry in entries:
            self._fallback.upsert(
                namespace, [{**entry, "organization_id": organization_id}]
            )
        return len(entries)

    def search(
        self,
        namespace: str,
        vector: list[float],
        organization_id: str,
        limit: int = 20,
        extra_filter: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        """Similarity search ALWAYS scoped to exactly one organization."""
        if not vector or not organization_id:
            return []

        if self.connect() in QDRANT_MODES:
            from qdrant_client.models import (  # noqa: PLC0415
                FieldCondition,
                Filter,
                MatchValue,
            )

            conditions = [
                FieldCondition(
                    key="organization_id", match=MatchValue(value=organization_id)
                )
            ]
            for key, value in (extra_filter or {}).items():
                if value not in (None, ""):
                    conditions.append(
                        FieldCondition(key=key, match=MatchValue(value=value))
                    )
            try:
                hits = self._query(namespace, vector, conditions, limit)
                return [
                    {
                        **(h.payload or {}),
                        "report_id": (h.payload or {}).get("report_id"),
                        "score": float(h.score),
                    }
                    for h in hits
                ]
            except Exception as exc:  # noqa: BLE001
                log.error("qdrant search failed, falling back: %s", exc)
                self._degrade(exc)

        return [
            {
                "report_id": p["report_id"],
                "score": p.get("score", 0.0),
                "report_type": p.get("report_type", ""),
                "category": p.get("category", ""),
                "location": p.get("location", ""),
            }
            for p in self._fallback.search(namespace, vector, organization_id, limit)
        ]

    def _query(
        self,
        namespace: str,
        vector: list[float],
        conditions: list[Any],
        limit: int,
    ) -> list[Any]:
        """Point search that works on both client generations.

        qdrant-client 1.19 **removed** ``search()``; the replacement is
        ``query_points()``, which returns a response whose ``.points`` hold the
        hits. The old name now raises AttributeError - and because this call sits
        behind a broad ``except`` in ``search()``, that looked exactly like "no
        candidates matched" rather than a broken query: every match returned an
        empty list while the vectors sat safely in the collection.

        Detect the method instead of catching the difference, so a future
        removal cannot be mistaken for an empty result set again.
        """
        from qdrant_client.models import Filter  # noqa: PLC0415

        query_filter = Filter(must=conditions)
        if hasattr(self._client, "query_points"):
            response = self._client.query_points(
                collection_name=namespace,
                query=vector,
                limit=limit,
                query_filter=query_filter,
                with_payload=True,
            )
            return list(getattr(response, "points", response) or [])

        # Older clients expose only search().
        return list(
            self._client.search(
                collection_name=namespace,
                query_vector=vector,
                limit=limit,
                query_filter=query_filter,
                with_payload=True,
            )
        )

    def delete(self, namespace: str, organization_id: str, report_id: str) -> None:
        if self.connect() in QDRANT_MODES:
            point_id = str(
                uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"{organization_id}:{namespace}:{report_id}",
                )
            )
            try:
                self._client.delete(collection_name=namespace, points_selector=[point_id])
                return
            except Exception as exc:  # noqa: BLE001
                log.warning("qdrant delete failed: %s", exc)
        self._fallback.delete(namespace, organization_id, report_id)

    def clear(self) -> None:
        self._fallback.clear()

    def close(self) -> None:
        """Release the client.

        Matters for the on-disk tier: it holds a file lock for its lifetime, and
        letting the client die in an interpreter-shutdown ``__del__`` raises
        inside qdrant-client instead of closing cleanly. Callers that own the
        process (scripts, tests) should close explicitly.
        """
        client, self._client = self._client, None
        if client is not None:
            try:
                client.close()
            except Exception as exc:  # noqa: BLE001 - shutdown must not raise
                log.warning("error closing vector client: %s", exc)


store = VectorStore()

