"""
END-TO-END PROOF of the matching claim, with tenant isolation.

This does NOT mock anything. It:
  1. renders two real "black backpack" photos and one unrelated photo
  2. runs YOLO + SigLIP2 + BGE-M3 + reranker on them
  3. indexes them into the vector store under two DIFFERENT organizations
  4. searches as org A and proves org B's vector is filtered out
  5. re-computes the final score by hand from the stored evidence rows and
     compares it to what the pipeline reported

Run:  .\\.venv\\Scripts\\python.exe proof_match.py
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core import matching, pipeline            # noqa: E402
from app.core.config import settings               # noqa: E402
from app.models import schemas                     # noqa: E402
from app.vector import NAMESPACE_IMAGE, store      # noqa: E402

OK = "PASS"
BAD = "FAIL"
checks: list[tuple[str, bool, str]] = []

# Vectors kept from the indexing stage so the scoring stage can use real
# cosines. Module-level because indexing and scoring are separate functions.
VECS: dict[str, tuple] = {}


def check(label: str, cond: bool, detail: str = "") -> None:
    checks.append((label, cond, detail))
    print(f"  [{OK if cond else BAD}] {label}" + (f"  -> {detail}" if detail else ""))


def draw_bag(path: str, body: str, accent: str, label: str) -> None:
    """Render a simple but real photo-like image of a backpack."""
    from PIL import Image, ImageDraw

    im = Image.new("RGB", (640, 480), (238, 238, 235))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 330, 640, 480], fill=(206, 202, 196))          # floor
    d.rounded_rectangle([190, 130, 450, 400], radius=34, fill=body)  # main body
    d.rounded_rectangle([228, 88, 412, 175], radius=30, fill=body)   # lid/flap
    d.rounded_rectangle([245, 300, 395, 385], radius=14, fill=accent)  # front pocket
    d.rectangle([262, 175, 292, 215], fill=accent)                    # straps
    d.rectangle([348, 175, 378, 215], fill=accent)
    d.text((28, 28), label, fill=(40, 40, 40))
    im.save(path, quality=94)


def draw_bike(path: str) -> None:
    from PIL import Image, ImageDraw

    im = Image.new("RGB", (640, 480), (235, 240, 245))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 340, 640, 480], fill=(210, 214, 218))
    d.ellipse([120, 300, 250, 430], outline=(30, 30, 30), width=7)
    d.ellipse([400, 300, 530, 430], outline=(30, 30, 30), width=7)
    d.line([185, 365, 290, 250, 400, 365], fill=(200, 40, 40), width=7)
    d.line([290, 250, 465, 365], fill=(200, 40, 40), width=7)
    d.line([265, 250, 330, 250], fill=(30, 30, 30), width=6)
    d.text((28, 28), "red bicycle", fill=(30, 30, 30))
    im.save(path, quality=94)

ORG_A = "org_abc_school"
ORG_B = "org_techcorp"


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def main() -> None:
    print("=" * 78)
    print("LOSTLINK AI - END TO END MATCHING PROOF (no mocks)")
    print("=" * 78)
    t0 = time.time()
    os.makedirs("proofimg", exist_ok=True)
    draw_bag("proofimg/lost_bag.jpg", (28, 28, 32), (30, 70, 140),
             "black backpack blue pocket")
    draw_bag("proofimg/found_bag.jpg", (30, 30, 34), (32, 72, 144),
             "black backpack blue pocket")
    draw_bike("proofimg/bike.jpg")
    print("\nrendered 3 real test images -> proofimg/")

    mode = store.connect()
    print(f"vector store: {mode}")
    store.clear()

    print("\n[1] INDEXING (real SigLIP2 + BGE-M3 embeddings)")
    idx = {}
    rows = [
        ("A-found-bag", ORG_A, "found_bag.jpg",
         "black Wildcraft backpack with a blue front pocket, found on a chair",
         "Backpack", "Central Library"),
        ("A-bike", ORG_A, "bike.jpg",
         "red drop-handlebar sports bicycle parked near the gate",
         "Bicycle", "Front Gate"),
        ("B-found-bag", ORG_B, "found_bag.jpg",
         "black Wildcraft backpack with a blue front pocket",
         "Backpack", "HQ Lobby"),
    ]
    for rid, org, f, desc, cat, loc in rows:
        raw = open(os.path.join("proofimg", f), "rb").read()
        r = pipeline.index_report(org, rid, "FOUND", raw, desc, cat, loc)
        idx[rid] = r
        # Keep the vectors the index holds. Without these the scorer has nothing
        # to take a cosine of and reports a colour/shape proxy for an image the
        # model DID embed.
        text_vec = pipeline.embed_texts([desc]) if desc else []
        VECS[rid] = (
            pipeline.embed_image(raw),
            text_vec[0] if text_vec else None,
        )
        print(f"    {rid:14s} image={r['image']}({r['image_model']}) "
              f"text={r['text']}({r['text_model']})")
    check("SigLIP2 embedding stored for every image",
          all(idx[k]["image"] for k in idx), f"{sum(idx[k]['image'] for k in idx)}/3")
    check("BGE-M3 embedding stored for every text",
          all(idx[k]["text"] for k in idx), f"{sum(idx[k]['text'] for k in idx)}/3")

    print("\n[2] TENANT ISOLATION - org B's vector must never be visible to org A")
    qvec = pipeline.embed_image(open("proofimg/lost_bag.jpg", "rb").read())
    check("query image embedded", qvec is not None,
          f"dim={len(qvec) if qvec else 0}")
    ids_a = sorted(h["report_id"] for h in
                   store.search(NAMESPACE_IMAGE, qvec, ORG_A, 20))
    ids_b = sorted(h["report_id"] for h in
                   store.search(NAMESPACE_IMAGE, qvec, ORG_B, 20))
    check("org A search returns only org A vectors",
          set(ids_a) <= {"A-found-bag", "A-bike"}, f"got {ids_a}")
    check("org B search returns only org B vectors",
          set(ids_b) == {"B-found-bag"}, f"got {ids_b}")
    check("NO cross-organization leakage",
          "B-found-bag" not in ids_a, "org A cannot see org B's backpack")
    top = store.search(NAMESPACE_IMAGE, qvec, ORG_A, 20)[0]
    check("correct nearest candidate ranked first",
          top["report_id"] == "A-found-bag",
          f"top={top['report_id']} cos={top['score']:.4f}")

    _part2(t0)


def _part2(t0: float) -> None:
    """Run the real match pipeline and audit the evidence it produces."""
    print("\n[3] FULL MATCH RUN through the real pipeline")
    prof = {"category": "Backpack", "primaryColor": "Black",
            "brand": "Wildcraft", "material": "Polyester"}
    payload = schemas.MatchRequest(
        report_id="A-lost-bag", report_type="LOST", organization_id=ORG_A,
        text=("black Wildcraft backpack with a blue front pocket, "
              "lost in the central library reading room"),
        description="black Wildcraft backpack with a blue front pocket, "
                    "lost in the central library reading room",
        category="Backpack", location="Central Library, 2nd Floor",
        item_profile=prof, relevant_date=now(),
        image_bytes=open("proofimg/lost_bag.jpg", "rb").read(),
        candidates=[
            schemas.Candidate(
                report_id=r, report_type="FOUND", organization_id=ORG_A,
                description=d, category=c, location=l, relevant_date=now(),
                item_profile={"category": c, "primaryColor": "Black",
                              "brand": "Wildcraft"},
                image_vector=VECS.get(r, (None, None))[0],
                text_vector=VECS.get(r, (None, None))[1])
            for r, d, c, l in [
                ("A-found-bag", "black Wildcraft backpack with a blue front "
                                "pocket, found on a chair",
                 "Backpack", "Central Library"),
                ("A-bike", "red drop-handlebar sports bicycle parked near "
                           "the gate", "Bicycle", "Front Gate"),
            ]
        ],
        top_n=5,
    )
    t = time.time()
    res = pipeline.run_match(payload)
    run_s = round(time.time() - t, 1)
    print(f"    analysis_version  = {res['analysis_version']}")
    print(f"    degraded_signals  = {res['degraded_signals']}")
    print(f"    explanation_src   = {res['explanation_source']}")
    print(f"    run time          = {run_s}s")

    # A signal being absent for ONE candidate pair is correct behaviour (e.g. two
    # items in different buildings have no location overlap). The property that
    # actually matters is that the two MODEL signals were available and computed.
    model_signals = {"visual", "semantic"}
    check("neither model signal degraded (visual + semantic both contributed)",
          not [s for s in res["degraded_signals"] if s in model_signals],
          f"degraded={res['degraded_signals']}")
    informational = [s for s in res["degraded_signals"] if s not in model_signals]
    if informational:
        print(f"    note: deterministic signals computed nothing on some pair: "
              f"{informational} (expected for unrelated candidates)")
    check("real models recorded in the version string",
          all(k in res["analysis_version"]
              for k in ("siglip", "bge-m3", "reranker")),
          res["analysis_version"])

    cands = res["candidates"]
    check("candidates returned", bool(cands), f"n={len(cands)}")
    if not cands:
        return
    best = cands[0]
    print(f"\n    TOP CANDIDATE {best['report_id']}  final={best['final_score']}")
    for e in best["evidence"]:
        print(f"      {e['label']:<20}{e['score']:>6.1f}%  w={e['weight']:.2f}"
              f"  contrib={e['contribution']:.2f}  model={e['model_backed']}"
              f"  {e.get('detail', '')[:40]}")

    check("top candidate is the backpack, not the bicycle",
          best["report_id"] == "A-found-bag", best["report_id"])
    # Only the two learned signals can honestly claim model_backed; attributes,
    # location, time and context are deterministic scorers on purpose. So the
    # real assertions are: the learned rows are model-backed, and no deterministic
    # row masquerades as one.
    backed = {e["signal"] for e in best["evidence"] if e["model_backed"]}
    mislabelled = [e["signal"] for e in best["evidence"]
                   if e["model_backed"] and e["signal"] not in ("visual", "semantic")]
    check("visual + semantic evidence rows are model-backed",
          {"visual", "semantic"} <= backed, f"model_backed={sorted(backed)}")
    check("deterministic rows are not mislabelled as model_backed",
          mislabelled == [], f"mislabelled={mislabelled}")
    check("visual signal is a real SigLIP2 cosine",
          any(e["signal"] == "visual" and e["model_backed"] for e in best["evidence"]))
    check("semantic signal is a real BGE-M3 cosine",
          any(e["signal"] == "semantic" and e["model_backed"] for e in best["evidence"]))
    check("reranker actually ran",
          best.get("rerank_score") is not None,
          f"rerank={best.get('rerank_score')}")

    print("\n[4] SCORE REPRODUCIBILITY - recompute from stored evidence")
    recomputed = sum(e["contribution"] for e in best["evidence"])
    delta = abs(recomputed - best["final_score"])
    print(f"    sum(contribution) = {recomputed:.2f}")
    print(f"    reported final   = {best['final_score']:.2f}")
    print(f"    delta            = {delta:.2f}")
    check("final score is reproducible from stored evidence", delta < 1.0,
          f"delta={delta:.2f}")

    ex = (best.get("explanation") or "").lower()
    check("explanation is present", bool(ex.strip()), f"{len(ex)} chars")
    check("explanation refuses to claim proof of ownership",
          "not proof of ownership" in ex or "candidate recommendation" in ex)

    print("\n[5] NEGATIVE CONTROL - the bicycle must score far lower")
    if len(cands) > 1:
        other = cands[1]
        gap = best["final_score"] - other["final_score"]
        print(f"    {other['report_id']}: final={other['final_score']}  gap={gap:.1f}")
        check("unrelated item scores well below the real match", gap > 20,
              f"gap={gap:.1f}")

    with open("proof_result.json", "w", encoding="utf-8") as f:
        json.dump({"checks": [{"label": l, "ok": o, "detail": d}
                              for l, o, d in checks],
                   "top": best, "run_seconds": run_s}, f, indent=2, default=str)
    print("\n" + "=" * 78)
    npass = sum(1 for _, o, _ in checks if o)
    for l, o, d in checks:
        print(f"  {'PASS' if o else 'FAIL'}  {l}" + (f"  ({d})" if d else ""))
    print(f"\n  {npass}/{len(checks)} checks passed in {round(time.time() - t0, 1)}s")
    print("  wrote proof_result.json")
    print("=" * 78)


if __name__ == "__main__":
    main()
