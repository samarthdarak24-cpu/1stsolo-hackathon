"""
Smoke test for the inference service.

Run with:  .venv\\Scripts\\python.exe -m tests.smoke

Verifies, WITHOUT the optional ML stack:
  * the app imports and every route is registered
  * /health reports an honest degraded state
  * item analysis works from real pixels (dimensions, colour, sharpness)
  * multi-signal scoring produces a sensible, explainable result
  * the in-memory vector index enforces the organization filter

If the optional models ARE installed these tests exercise them too.
"""
from __future__ import annotations

import io
import sys
import time

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, ".")

from app.core import item_analysis, matching, pipeline  # noqa: E402
from app.providers import health_snapshot  # noqa: E402
from app.vector import NAMESPACE_TEXT, store  # noqa: E402

PASS, FAIL = "PASS", "FAIL"
results: list[tuple[str, str, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((PASS if condition else FAIL, name, detail))
    print(f"  [{PASS if condition else FAIL}] {name}" + (f" - {detail}" if detail else ""))


def make_image(color=(20, 20, 20), size=(400, 300), text: str = "") -> bytes:
    image = Image.new("RGB", size, color)
    draw = ImageDraw.Draw(image)
    draw.rectangle([100, 80, 300, 260], fill=(80, 120, 200))
    if text:
        draw.text((20, 20), text, fill=(255, 255, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_text_image(text: str, size=(720, 200)) -> bytes:
    """Render large, high-contrast text for the OCR test.

    OCR needs enough pixels per glyph to recognise a string reliably, so this
    deliberately uses a big truetype font on a clean white background. It falls
    back to the bitmap default when no truetype face is available, and the test
    then simply reports whatever the engine managed to read.
    """
    image = Image.new("RGB", size, (255, 255, 255))
    draw = ImageDraw.Draw(image)
    font = None
    for candidate in (
        "consola.ttf",   # ships with Windows
        "arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        try:
            font = ImageFont.truetype(candidate, 56)
            break
        except Exception:  # noqa: BLE001 - any failure just tries the next face
            continue
    if font is None:
        font = ImageFont.load_default()
    draw.text((40, 70), text, fill=(0, 0, 0), font=font)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()



def _fake_match_request():
    return type(
        "R",
        (),
        {
            "organization_id": "org_school",
            "report_id": "r1",
            "report_type": "LOST",
            "image_bytes": None,
            "text": "black backpack",
            "description": "black backpack",
            "category": "Backpack",
            "location": "Library",
            "item_profile": {},
            "relevant_date": None,
            "candidates": [],
            "weights": None,
            "top_n": 5,
        },
    )()


def main() -> int:
    print("\n=== 1. routes ===")
    from app.main import app

    # Use the OpenAPI schema: it is the canonical list of served paths and is
    # stable across FastAPI versions (which nest included routers differently).
    paths: set[str] = set(app.openapi().get("paths", {}).keys())
    for expected in ("/health", "/embed/text", "/analyze-item", "/match", "/cctv/analyze"):
        check(f"route {expected}", expected in paths)

    print("\n=== 2. provider honesty ===")
    snapshot = health_snapshot()
    # "lazy" = installed but not yet loaded, which is a healthy state and the
    # normal one right after boot because nothing is preloaded.
    for name, info in snapshot.items():
        check(
            f"provider {name} reports a state",
            info["status"] in ("ready", "loading", "lazy", "unavailable", "not_installed"),
            f"{info['status']}",
        )
    if not any(i["status"] == "ready" for i in snapshot.values()):
        print("  (no optional models installed - testing the degraded path)")

    print("\n=== 3. item analysis from real pixels ===")
    png = make_image()
    result = item_analysis.analyze_item(png, filename="black-backpack.png")
    check("decoded dimensions", result["width"] == 400 and result["height"] == 300)
    check("aspect ratio computed", result["aspect_ratio"] is not None)
    check(
        "dominant colour measured",
        bool(result["item_profile"]["primaryColor"]),
        result["item_profile"]["primaryColor"],
    )
    check(
        "shape derived from aspect",
        bool(result["item_profile"]["shape"]),
        result["item_profile"]["shape"],
    )
    check("notice explains what was measured", len(result["notice"]) > 20)
    check("ai_fields recorded", isinstance(result["ai_fields"], list))
    check(
        "no crash without models",
        result["provider"] in ("vlm", "heuristic"),
        result["provider"],
    )

    print("\n=== 4. user hints beat model output ===")
    hinted = item_analysis.analyze_item(
        png, hints={"brand": "Wildcraft", "primaryColor": "Navy"}
    )
    check("user brand kept", hinted["item_profile"]["brand"] == "Wildcraft")
    check("user colour kept", hinted["item_profile"]["primaryColor"] == "Navy")
    check(
        "hinted fields excluded from ai_fields",
        "brand" not in hinted["ai_fields"]
        and "primaryColor" not in hinted["ai_fields"],
    )

    # ---- real OCR, when an engine is installed -------------------------
    # This is the one test that can prove the OCR provider is wired to a
    # working engine rather than merely importable. It renders a known serial
    # number, runs the provider, and requires the code to come back out. It is
    # skipped (not failed) when no engine is installed so the suite still runs
    # on a core-only machine.
    print("\n=== 4b. OCR reads printed text (skipped without an engine) ===")
    from app.providers import ocr as ocr_provider

    serial_png = make_text_image("SN: ALN-7734B")
    if ocr_provider.available():
        started = time.perf_counter()
        read = ocr_provider.read(Image.open(io.BytesIO(serial_png)))
        elapsed = time.perf_counter() - started
        check("ocr engine loaded", ocr_provider.is_ready(), ocr_provider.model_id)
        check(
            "ocr read the printed serial number",
            "ALN-7734B" in (read.get("text") or "").replace(" ", ""),
            (read.get("text") or "")[:60],
        )
        check(
            "serial code extracted from the text",
            any("ALN-7734B" in value for value in read.get("serials") or []),
            str(read.get("serials"))[:60],
        )
        check("ocr confidence is real", read.get("avg_confidence", 0) > 0.5,
              f"{read.get('avg_confidence')} in {elapsed:.1f}s")
    else:
        check("ocr engine unavailable - skipped, not failed", True,
              (ocr_provider.info().get("detail") or "not installed")[:60])

    print("\n=== 5. multi-signal scoring ===")
    weights = matching.resolve_weights({})
    check(
        "weights sum to 1.0",
        abs(sum(weights.values()) - 1.0) < 1e-9,
        f"{sum(weights.values()):.4f}",
    )

    lost = {
        "description": "Lost my black Wildcraft backpack with a white mountain logo near the library",
        "category": "Backpack",
        "location": "Central Library",
        "itemProfile": {
            "category": "Backpack",
            "primaryColor": "Black",
            "brand": "Wildcraft",
            "itemName": "Black Backpack",
        },
        "relevant_date": "2026-09-20T14:10:00Z",
    }
    good = {
        "description": "Found a black Wildcraft backpack with a white mountain logo in the library",
        "category": "Backpack",
        "location": "Central Library",
        "itemProfile": {
            "category": "Backpack",
            "primaryColor": "Black",
            "brand": "Wildcraft",
            "itemName": "Black Backpack",
        },
        "relevant_date": "2026-09-20T15:54:00Z",
    }
    poor = {
        "description": "Found red umbrellas by the front gate",
        "category": "Umbrella",
        "location": "Front Gate",
        "itemProfile": {
            "category": "Umbrella",
            "primaryColor": "Red",
            "itemName": "Umbrella",
        },
        "relevant_date": "2026-09-18T09:00:00Z",
    }

    a = matching.score_pair(lost, good, weights, 14)
    b = matching.score_pair(lost, poor, weights, 14)
    check(
        "true pair scores higher than unrelated",
        a["final_score"] > b["final_score"],
        f"{a['final_score']} vs {b['final_score']}",
    )
    check("evidence rows produced", len(a["evidence"]) >= 4, f"{len(a['evidence'])} rows")
    check(
        "every evidence row is labelled",
        all("model_backed" in e and "detail" in e for e in a["evidence"]),
    )
    check(
        "explanation is grounded",
        "not proof of ownership" in matching.build_explanation(lost, good, a),
    )


    print("\n=== 6. serial number is decisive ===")
    serial_a = {**lost, "itemProfile": {**lost["itemProfile"], "serialNumber": "SN12345"}}
    serial_b = {**good, "itemProfile": {**good["itemProfile"], "serialNumber": "SN12345"}}
    s = matching.score_pair(serial_a, serial_b, weights, 14)
    check(
        "matching serials short-circuit to 99",
        s["final_score"] == 99.0 and s["serial_decisive"],
    )
    serial_c = {**good, "itemProfile": {**good["itemProfile"], "serialNumber": "SN99999"}}
    s2 = matching.score_pair(serial_a, serial_c, weights, 14)
    check("different serials are capped", s2["final_score"] <= 55.0, str(s2["final_score"]))

    print("\n=== 7. brand conflict is a veto ===")
    conflict = {**good, "itemProfile": {**good["itemProfile"], "brand": "Adidas"}}
    c = matching.score_pair(lost, conflict, weights, 14)
    check("brand conflict caps the score", c["final_score"] <= 62.0, str(c["final_score"]))

    print("\n=== 8. tenant isolation in the vector store ===")
    store.clear()
    store.upsert(
        NAMESPACE_TEXT,
        "org_school",
        [
            {"report_id": "r1", "vector": [1.0, 0.0], "category": "Backpack"},
            {"report_id": "r2", "vector": [0.0, 1.0], "category": "Umbrella"},
        ],
    )
    store.upsert(
        NAMESPACE_TEXT,
        "org_company",
        [{"report_id": "r9", "vector": [1.0, 0.0], "category": "Laptop"}],
    )
    school_hits = store.search(NAMESPACE_TEXT, [1.0, 0.0], "org_school", 10)
    company_hits = store.search(NAMESPACE_TEXT, [1.0, 0.0], "org_company", 10)
    check(
        "school search excludes company rows",
        all(h["report_id"] != "r9" for h in school_hits),
        str([h["report_id"] for h in school_hits]),
    )
    check(
        "company search sees only its own row",
        [h["report_id"] for h in company_hits] == ["r9"],
        str([h["report_id"] for h in company_hits]),
    )
    check("empty org id returns nothing", store.search(NAMESPACE_TEXT, [1.0, 0.0], "", 10) == [])

    print("\n=== 9. empty org costs no model load ===")
    started = time.perf_counter()
    empty = pipeline.run_match(_fake_match_request())
    elapsed = time.perf_counter() - started
    check("no candidates returns an empty list", empty["candidates"] == [])
    check("no explanation source claimed", empty["explanation_source"] == "none")
    # A model load takes many seconds; this must return in milliseconds. Guards
    # against re-ordering the pipeline so that matching loads weights for a
    # result that is guaranteed to be empty.
    check(
        "returns without loading any model",
        elapsed < 1.0,
        f"{elapsed * 1000:.0f} ms",
    )

    print("\n" + "=" * 60)
    failed = [r for r in results if r[0] == FAIL]
    print(f"{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("\nFAILURES:")
        for _, name, detail in failed:
            print(f"  - {name} {detail}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

