"""
Durability test for the vector store's on-disk tier.

Run with (service stopped, so this process owns the index lock):

    .venv\\Scripts\\python.exe -m tests.vector_durability write
    .venv\\Scripts\\python.exe -m tests.vector_durability read

Why two processes: the claim under test is that embeddings outlive the process
that wrote them, and a single run cannot prove that. `write` stores a known
vector for a test organization; `read` is a separate interpreter that fails if
it cannot retrieve it. It also re-asserts the tenant filter, because a durable
index that leaks across organizations would be worse than losing the data.

Exit code 0 means the guarantee holds.
"""
from __future__ import annotations

import sys

sys.path.insert(0, ".")

from app.vector.store import NAMESPACE_TEXT, store  # noqa: E402

ORG = "durability-test"
OTHER_ORG = "durability-test-other"
REPORT_ID = "vector-durability-probe"
OTHER_REPORT_ID = f"{REPORT_ID}-other"
# Simple orthogonal vector: the exact value does not matter, only that the same
# one comes back with a comparable score.
VECTOR = [1.0, 0.0, 0.0, 0.0]


def _require_durable() -> int:
    mode = store.connect()
    print(f"store mode: {mode}")
    if mode == "in-memory":
        print(
            "FAIL: the store fell back to the per-process index, so nothing this "
            "run writes can survive it. Check QDRANT_LOCAL_PATH is writable."
        )
        return 1
    return 0


def write() -> int:
    if _require_durable():
        return 1
    written = store.upsert(
        NAMESPACE_TEXT,
        ORG,
        [
            {
                "report_id": REPORT_ID,
                "vector": VECTOR,
                "report_type": "LOST",
                "category": "Probe",
            }
        ],
    )
    store.upsert(
        NAMESPACE_TEXT,
        OTHER_ORG,
        [{"report_id": OTHER_REPORT_ID, "vector": VECTOR, "report_type": "LOST"}],
    )
    print(f"wrote {written} point(s) for '{ORG}' plus one for '{OTHER_ORG}'")
    return 0


def read() -> int:
    if _require_durable():
        return 1

    hits = store.search(NAMESPACE_TEXT, VECTOR, ORG, limit=5)
    ids = [h.get("report_id") for h in hits]
    print(f"found for '{ORG}': {ids}")

    if REPORT_ID not in ids:
        print(
            "FAIL: the probe written by the other process is gone - the index did "
            "not survive the restart."
        )
        return 1

    if OTHER_REPORT_ID in ids:
        print("FAIL: a vector from another organization was returned. Tenant leak.")
        return 1

    # The other tenant must see its own point and only its own.
    other_ids = [h.get("report_id") for h in store.search(NAMESPACE_TEXT, VECTOR, OTHER_ORG, limit=5)]
    print(f"found for '{OTHER_ORG}': {other_ids}")
    if other_ids != [OTHER_REPORT_ID]:
        print(f"FAIL: expected exactly [{OTHER_REPORT_ID}], got {other_ids}")
        return 1

    # Clean up so repeated runs start from a known state.
    store.delete(NAMESPACE_TEXT, ORG, REPORT_ID)
    store.delete(NAMESPACE_TEXT, OTHER_ORG, OTHER_REPORT_ID)

    print("PASS: embeddings survive a restart and the tenant filter still holds.")
    return 0


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in ("write", "read"):
        print(__doc__)
        return 2
    try:
        return write() if sys.argv[1] == "write" else read()
    finally:
        # Explicit close: this process owns the on-disk index lock, and letting
        # qdrant-client die during interpreter teardown raises from __del__.
        store.close()


if __name__ == "__main__":
    raise SystemExit(main())
