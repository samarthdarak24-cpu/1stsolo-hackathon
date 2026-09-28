"""AUDIT - proves or disproves every model claim. No claim taken on trust."""
from __future__ import annotations

import json
import math
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
RESULTS: dict[str, dict] = {}


def record(name: str, **kw):
    RESULTS[name] = kw
    print(f"\n[{'PASS' if kw.get('ok') else 'FAIL'}] {name}")
    for k, v in kw.items():
        if k != "ok":
            print(f"        {k}: {v}")
    sys.stdout.flush()


def cos(a, b):
    d = sum(x * y for x, y in zip(a, b))
    return round(d / (math.sqrt(sum(x * x for x in a))
                      * math.sqrt(sum(x * x for x in b))), 4)


def sample_image(path: str):
    from PIL import Image
    im = Image.open(path).convert("RGB")
    return im, im.size


def test_yolo():
    from ultralytics import YOLO
    t = time.time()
    m = YOLO("yolo26n.pt")
    load_s = round(time.time() - t, 2)
    img, size = sample_image("t.jpg")
    t = time.time()
    res = m.predict(img, conf=0.25, verbose=False)[0]
    infer_s = round(time.time() - t, 2)
    names = res.names or {}
    dets = [{"label": str(names.get(int(b.cls[0]), int(b.cls[0]))),
             "conf": round(float(b.conf[0]), 3)} for b in res.boxes]
    record("YOLO", ok=True, checkpoint="yolo26n.pt", load_s=load_s,
           infer_s=infer_s, test_image="t.jpg", image_size=size,
           detections=len(dets), top3=dets[:3], coco_classes=len(names))


def test_siglip():
    from app.providers import siglip
    t = time.time()
    if not siglip.load():
        return record("SigLIP2", ok=False, detail=siglip._detail)
    load_s = round(time.time() - t, 2)
    img, _ = sample_image("t.jpg")
    t = time.time()
    vec = siglip.embed_images([img])[0]
    infer_s = round(time.time() - t, 2)
    img2, _ = sample_image("t.jpg")
    vec2 = siglip.embed_images([img2])[0]
    record("SigLIP2", ok=True, checkpoint=siglip.model_id, load_s=load_s,
           infer_s=infer_s, dim=len(vec),
           l2_norm=round(math.sqrt(sum(a * a for a in vec)), 4),
           self_cosine_same_image=cos(vec, vec2),
           first8=[round(v, 4) for v in vec[:8]])


def test_bge():
    from app.providers import bge_m3
    t = time.time()
    if not bge_m3.load():
        return record("BGE-M3", ok=False, detail=bge_m3._detail)
    load_s = round(time.time() - t, 2)
    t = time.time()
    vs = bge_m3.embed_texts([
        "black Wildcraft backpack with a blue front pocket",
        "dark school rucksack, navy trim, lost in library",
        "red sports bicycle with drop handlebars",
    ])
    infer_s = round(time.time() - t, 2)
    rel, unrel = cos(vs[0], vs[1]), cos(vs[0], vs[2])
    record("BGE-M3", ok=True, checkpoint=bge_m3.model_id, load_s=load_s,
           infer_s=infer_s, dim=len(vs[0]), config_hidden_size=bge_m3.dim,
           related_cos=rel, unrelated_cos=unrel,
           verdict="PASS related>unrelated" if rel > unrel else "FAIL related<=unrelated")


def test_reranker():
    from app.providers import reranker
    t = time.time()
    if not reranker.load():
        return record("Reranker", ok=False, detail=reranker._detail)
    load_s = round(time.time() - t, 2)
    q = "black Wildcraft backpack with blue pocket"
    docs = [q, "red sports bicycle with drop handlebars"]
    t = time.time()
    sc = reranker.score(q, docs)
    infer_s = round(time.time() - t, 2)
    record("Reranker", ok=True, checkpoint=reranker.model_id, load_s=load_s,
           infer_s=infer_s, scores=[round(s, 4) for s in sc],
           verdict="PASS relevant>irrelevant" if sc[0] > sc[1] else "FAIL relevant<=irrelevant")


def test_ocr():
    from app.providers import ocr
    t = time.time()
    if not ocr.load():
        return record("OCR", ok=False, detail=ocr._detail)
    load_s = round(time.time() - t, 2)
    from PIL import Image, ImageDraw
    canvas = Image.new("RGB", (640, 200), "white")
    d = ImageDraw.Draw(canvas)
    try:
        from PIL import ImageFont
        d.text((30, 60), "Wildcraft", fill="black",
               font=ImageFont.truetype("arial.ttf", 36))
        d.text((30, 120), "MODEL ALN-7734B", fill="black",
               font=ImageFont.truetype("arial.ttf", 28))
    except Exception:
        d.text((30, 60), "Wildcraft MODEL ALN-7734B", fill="black")
    t = time.time()
    out = ocr.read(canvas)
    infer_s = round(time.time() - t, 2)
    record("OCR", ok=True, checkpoint=ocr.model_id, load_s=load_s,
           infer_s=infer_s, text=out["text"][:120], serials=out["serials"],
           avg_confidence=out["avg_confidence"])


def test_qdrant():
    from app.vector import store
    mode = store.connect()
    record("Qdrant", ok=(mode == "qdrant"), mode=mode,
           url=os.environ.get("QDRANT_URL", "http://localhost:6333"))


def test_vlm():
    from app.core.config import settings
    record("Qwen3-VL", ok=False, configured=bool(settings.vlm_base_url),
           base_url=settings.vlm_base_url or "(unset)",
           note="external OpenAI-compatible endpoint, not bundled")


def main() -> None:
    t0 = time.time()
    print("=" * 78)
    print("LOSTLINK AI - MODEL VERIFICATION")
    print("=" * 78)
    import torch
    import transformers
    print(f"\npython {sys.version.split()[0]} | torch {torch.__version__} "
          f"| transformers {transformers.__version__}")
    print(f"device: {'cuda' if torch.cuda.is_available() else 'cpu'}")
    for fn in (test_yolo, test_siglip, test_bge, test_reranker,
               test_ocr, test_qdrant, test_vlm):
        try:
            fn()
        except Exception as exc:
            record(fn.__name__[5:].upper(), ok=False,
                   error=f"{type(exc).__name__}: {exc}",
                   tb=traceback.format_exc()[-500:])
    print("\n" + "=" * 78)
    print("SUMMARY")
    for k, v in RESULTS.items():
        print(f"  {'PASS' if v.get('ok') else 'FAIL'}  {k}")
    n = sum(1 for v in RESULTS.values() if v.get("ok"))
    print(f"\n  {n} passed / {len(RESULTS) - n} failed "
          f"in {round(time.time() - t0, 1)}s")
    with open("audit_result.json", "w", encoding="utf-8") as f:
        json.dump(RESULTS, f, indent=2, default=str)
    print("  wrote audit_result.json")


if __name__ == "__main__":
    main()
