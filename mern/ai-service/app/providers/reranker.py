"""
BGE-reranker-v2-m3 — second-stage ranking.

Vector search (Qdrant) is fast and high-recall but weak at fine-grained ordering.
The reranker re-scores only the top ~20 candidates, which is where the compute
is affordable, and pushes the true item to the top. This is the standard
retrieve-then-rerank shape and it is a meaningful accuracy win on the
"black backpack" vs "black backpack with blue stripe" class of confusion.

It reranks; it never replaces first-stage retrieval.
"""
from __future__ import annotations

import logging
from typing import Any

from app.core.config import settings
from app.providers.base import LazyProvider, register

log = logging.getLogger("lostlink.providers.reranker")


class BgeReranker(LazyProvider):
    name = "reranker"
    model_id = settings.reranker_model

    def _load(self) -> dict[str, Any]:
        try:
            from transformers import AutoModelForSequenceClassification, AutoTokenizer  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError(
                "transformers is not installed - run: pip install -r requirements-ml.txt"
            ) from exc

        device = settings.resolved_device
        tokenizer = AutoTokenizer.from_pretrained(self.model_id)
        model = AutoModelForSequenceClassification.from_pretrained(self.model_id)
        model = model.to(device).eval()
        return {"model": model, "tokenizer": tokenizer, "device": device}

    def score(self, query: str, documents: list[str]) -> list[float]:
        """Return a relevance score in [0,1] for each document."""
        if not documents:
            return []

        import torch  # noqa: PLC0415

        bundle = self.require()
        pairs = [[query, doc] for doc in documents]
        encoded = bundle["tokenizer"](
            pairs,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        ).to(bundle["device"])

        with torch.no_grad():
            logits = bundle["model"](**encoded).logits.view(-1, 1)

        # raw logit -> probability. Cross-encoders are trained as binary
        # relevance classifiers, so a sigmoid is the correct read-out.
        return torch.sigmoid(logits).cpu().float().numpy().reshape(-1).tolist()


reranker = register(BgeReranker())
