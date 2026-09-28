"""
Embedding providers: SigLIP2 (visual) and BGE-M3 (text).

SigLIP2 is the primary visual retrieval model - it embeds a lost-item photo and
a found-item photo into the same space so cosine similarity is meaningful.
BGE-M3 handles free-text descriptions, which matters because two people describe
the same object very differently ("blue stripe backpack" vs "black bag with a
blue front marking").

Both are loaded through transformers lazily and independently. If either is
missing, the matching pipeline drops that signal and re-weights the rest; it
never silently substitutes a random vector.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from app.core.config import settings
from app.providers.base import LazyProvider, register

log = logging.getLogger("lostlink.providers.embeddings")


def _require_transformers() -> Any:
    try:
        import transformers  # noqa: PLC0415

        return transformers
    except ImportError as exc:
        raise RuntimeError(
            "transformers is not installed - run: pip install -r requirements-ml.txt"
        ) from exc


class SiglipEmbedder(LazyProvider):
    """SigLIP2 image/text tower.

    Both modalities share one projection space, which is what makes
    cross-modal retrieval (photo <-> text) possible.
    """

    name = "siglip"
    model_id = settings.siglip_model

    def _load(self) -> dict[str, Any]:
        _require_transformers()
        from transformers import AutoModel, AutoProcessor  # noqa: PLC0415

        device = settings.resolved_device
        model = AutoModel.from_pretrained(self.model_id).to(device).eval()
        processor = AutoProcessor.from_pretrained(self.model_id)
        return {"model": model, "processor": processor, "device": device}

    @staticmethod
    def _to_tensor(features: Any) -> Any:
        """Normalise a features result to a tensor.

        Depending on the transformers version, `get_image_features` /
        `get_text_features` return either a plain Tensor or a
        `BaseModelOutputWithPooling` wrapper. Older versions returned the tensor
        directly and newer ones wrap it, so handle both instead of assuming.
        """
        if hasattr(features, "cpu"):
            return features
        for attr in ("pooler_output", "image_embeds", "text_embeds", "last_hidden_state"):
            candidate = getattr(features, attr, None)
            if candidate is not None and hasattr(candidate, "cpu"):
                return candidate
        raise RuntimeError(
            f"SigLIP2 returned {type(features).__name__} with no usable embedding tensor"
        )

    def _encode(self, batch: Any, inputs: dict[str, Any], *, text: bool = False) -> list[list[float]]:
        import torch  # noqa: PLC0415

        moved = {k: v.to(batch["device"]) for k, v in inputs.items() if hasattr(v, "to")}
        with torch.no_grad():
            raw = (
                batch["model"].get_text_features(**moved)
                if text
                else batch["model"].get_image_features(**moved)
            )
        features = self._to_tensor(raw)
        if features.dim() == 1:
            features = features.unsqueeze(0)
        # L2-normalise so cosine similarity is a plain dot product downstream.
        features = torch.nn.functional.normalize(features, p=2, dim=-1)
        return features.cpu().float().numpy().tolist()

    def embed_images(self, images: list[Any]) -> list[list[float]]:
        bundle = self.require()
        inputs = bundle["processor"](images=images, return_tensors="pt")
        return self._encode(bundle, inputs)

    def embed_text(self, texts: list[str]) -> list[list[float]]:
        bundle = self.require()
        # SigLIP2's text tower needs a padded fixed length, not the 64-token default.
        inputs = bundle["processor"](
            text=texts,
            padding="max_length",
            max_length=getattr(bundle["processor"], "tokenizer", None)
            and bundle["processor"].tokenizer.model_max_length
            or 64,
            truncation=True,
            return_tensors="pt",
        )
        return self._encode(bundle, inputs, text=True)

    def info(self) -> dict[str, Any]:
        base = super().info()
        base["device"] = (
            settings.resolved_device if self._state == "ready" else None
        )
        return base


class BgeTextEmbedder(LazyProvider):
    """BGE-M3 dense text embeddings (multilingual, 1024-dim)."""

    name = "bge_m3"
    model_id = settings.bge_text_model

    def _load(self) -> dict[str, Any]:
        _require_transformers()
        from transformers import AutoModel, AutoTokenizer  # noqa: PLC0415

        device = settings.resolved_device
        tokenizer = AutoTokenizer.from_pretrained(self.model_id)
        model = AutoModel.from_pretrained(self.model_id).to(device).eval()
        return {"model": model, "tokenizer": tokenizer, "device": device}

    def embed_texts(self, texts: list[str], max_length: int = 512) -> list[list[float]]:
        import torch  # noqa: PLC0415

        bundle = self.require()
        encoded = bundle["tokenizer"](
            texts,
            padding=True,
            truncation=True,
            max_length=max_length,
            return_tensors="pt",
        ).to(bundle["device"])
        with torch.no_grad():
            output = bundle["model"](**encoded)
        # BGE-M3 uses CLS pooling + L2 normalisation.
        vectors = output.last_hidden_state[:, 0]
        vectors = torch.nn.functional.normalize(vectors, p=2, dim=1)
        return vectors.cpu().float().numpy().tolist()

    @property
    def dim(self) -> Optional[int]:
        if self._state != "ready":
            return None
        return int(self._model["model"].config.hidden_size)


siglip = register(SiglipEmbedder())
bge_m3 = register(BgeTextEmbedder())
