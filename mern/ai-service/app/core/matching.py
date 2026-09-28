"""
Multi-signal match scoring and evidence fusion.

The scores produced here rank candidates for a human to review. They are NOT
proof of ownership, and nothing in this module claims otherwise.

Signals and default weights (mirroring Node `config.matching`; the caller may
override them per-request):

    visual    0.35   SigLIP2 cosine, or an attribute proxy when no embedding
    semantic  0.20   BGE-M3 cosine over descriptions
    attributes 0.15  structured field agreement
    location  0.10   haversine when coordinates exist, else text similarity
    time      0.10   closeness of the relevant dates
    context   0.10   category + description-derived context

IMPORTANT â€” these weights are a starting configuration chosen by the team, not
a scientifically validated model. `WEIGHTS_ARE_TUNED_NOT_VALIDATED` exists so
the API and UI can say so out loud instead of implying false rigour.

`model_backed` on every evidence row records whether a real model produced that
signal or whether it is a metadata proxy. The UI relies on it.
"""
from __future__ import annotations

import logging
import math
import re
from datetime import datetime, timezone
from typing import Any, Optional

log = logging.getLogger("lostlink.matching")

WEIGHTS_ARE_TUNED_NOT_VALIDATED = True

DEFAULT_WEIGHTS: dict[str, float] = {
    "visual": 0.35,
    "semantic": 0.20,
    "attributes": 0.15,
    "location": 0.10,
    "time": 0.10,
    "context": 0.10,
}

SIGNAL_LABELS: dict[str, str] = {
    "visual": "Visual Similarity",
    "semantic": "Semantic Similarity",
    "attributes": "Attribute Match",
    "location": "Location Proximity",
    "time": "Time Proximity",
    "context": "Context Match",
}

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
    "with", "my", "i", "it", "is", "was", "this", "that", "have", "has", "had",
    "be", "been", "are", "its", "found", "lost", "item", "items", "left", "near",
    "somewhere", "around", "please", "report",
}

ATTRIBUTE_FIELDS = (
    "category",
    "primaryColor",
    "secondaryColor",
    "brand",
    "model",
    "material",
    "shape",
    "size",
    "visibleMark",
)

# Tokens that hint at a serial/model code inside free text.
_SERIAL_IN_TEXT = re.compile(
    r"\b(?:sn|serial|model|mdl|part|p\/n|no)\s*[:#-]?\s*([a-z0-9-]{5,})\b", re.I
)


# --------------------------------------------------------------------------
# small maths helpers
# --------------------------------------------------------------------------
def cosine(a: Optional[list[float]], b: Optional[list[float]]) -> Optional[float]:
    """Cosine similarity mapped to [0,1], or None when either side is absent."""
    if not a or not b or len(a) != len(b):
        return None
    dot = na = nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0.0 or nb <= 0.0:
        return None
    # [-1, 1] -> [0, 1] so 0 means "no similarity", not "opposite".
    return max(0.0, min(1.0, (dot / (math.sqrt(na) * math.sqrt(nb)) + 1.0) / 2.0))


def haversine_km(a: Optional[dict], b: Optional[dict]) -> Optional[float]:
    """Great-circle distance in km, or None when coordinates are missing."""
    if not a or not b:
        return None
    if a.get("lat") is None or a.get("lng") is None:
        return None
    if b.get("lat") is None or b.get("lng") is None:
        return None

    def to_rad(value: float) -> float:
        return value * math.pi / 180.0

    radius = 6371.0
    d_lat = to_rad(b["lat"] - a["lat"])
    d_lng = to_rad(b["lng"] - a["lng"])
    lat1 = to_rad(a["lat"])
    lat2 = to_rad(b["lat"])
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(d_lng / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(h))


def tokenize(text: str) -> list[str]:
    return [
        word
        for word in re.sub(r"[^a-z0-9\s]", " ", (text or "").lower()).split()
        if len(word) > 1 and word not in STOPWORDS
    ]


def text_similarity(a: str, b: str) -> float:
    """Rare-term-weighted token overlap in [0,1].

    Used for location text and as the context proxy. Not a replacement for
    BGE-M3 when that model is available.
    """
    ta, tb = tokenize(a), tokenize(b)
    if not ta or not tb:
        return 0.0
    freq_a: dict[str, int] = {}
    freq_b: dict[str, int] = {}
    for token in ta:
        freq_a[token] = freq_a.get(token, 0) + 1
    for token in tb:
        freq_b[token] = freq_b.get(token, 0) + 1

    shared = 0.0
    total = 0.0
    for term in set(freq_a) | set(freq_b):
        weight = 1.0 / (
            1.0 + math.log(1 + freq_a.get(term, 0) + freq_b.get(term, 0))
        )
        total += weight
        if freq_a.get(term) and freq_b.get(term):
            shared += weight
    return (shared / total) if total else 0.0


def normalise(value: Any) -> str:
    return str(value or "").strip().lower()


def relevant_date(report: dict[str, Any]) -> Optional[datetime]:
    for key in ("lostAt", "foundAt", "lastSeen", "createdAt", "relevant_date"):
        raw = report.get(key)
        if not raw:
            continue
        try:
            return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        except ValueError:
            continue
    return None


def extract_serials(text: str) -> list[str]:
    return [m.group(1).lower() for m in _SERIAL_IN_TEXT.finditer(text or "")]


def serial_exact_match(a: dict[str, Any], b: dict[str, Any]) -> Optional[bool]:
    """Exact serial match is decisive and short-circuits the other signals.

    Two reports carrying the same serial number describe the same physical
    object; nothing else in the signal set carries that weight.
    """
    sa = normalise((a.get("itemProfile") or {}).get("serialNumber"))
    sb = normalise((b.get("itemProfile") or {}).get("serialNumber"))
    if sa and sb:
        return sa == sb
    ta = extract_serials(a.get("description", ""))
    tb = extract_serials(b.get("description", ""))
    if ta and tb:
        return set(ta) == set(tb)
    return None


# --------------------------------------------------------------------------
# individual signals
# --------------------------------------------------------------------------
def score_visual(
    report: dict[str, Any], candidate: dict[str, Any]
) -> tuple[Optional[float], bool, str]:
    """Visual signal.

    Prefers a real SigLIP2 cosine. When either embedding is missing we fall
    back to a colour/shape attribute proxy and return ``model_backed=False``
    so the evidence row is labelled honestly.
    """
    image_score = cosine(
        report.get("imageVector"), candidate.get("image_vector")
    )
    if image_score is not None:
        return image_score, True, "SigLIP2 image embedding similarity"

    proxy = attribute_proxy(report, candidate)
    if proxy is None:
        return None, False, ""
    return proxy, False, "No image embedding - colour and shape proxy"


def attribute_proxy(a: dict[str, Any], b: dict[str, Any]) -> Optional[float]:
    """Cheap visual stand-in built from colour and shape agreement."""
    pa = a.get("itemProfile") or a.get("item_profile") or {}
    pb = b.get("itemProfile") or b.get("item_profile") or {}
    pairs = [
        (pa.get("primaryColor"), pb.get("primaryColor"), 3),
        (pa.get("shape"), pb.get("shape"), 2),
        (pa.get("secondaryColor"), pb.get("secondaryColor"), 1),
    ]
    total_weight = 0
    matched = 0
    for left, right, weight in pairs:
        if not left or not right:
            continue
        total_weight += weight
        if normalise(left) == normalise(right):
            matched += weight
    if total_weight == 0:
        return None
    return matched / total_weight


def score_semantic(
    report: dict[str, Any], candidate: dict[str, Any]
) -> tuple[Optional[float], bool, str]:
    """Semantic signal. BGE-M3 cosine when available, else token overlap."""
    dense = cosine(
        report.get("textVector"), candidate.get("text_vector")
    )
    if dense is not None:
        return dense, True, "BGE-M3 description embedding similarity"
    fallback = text_similarity(
        f"{report.get('description', '')} {report.get('text', '')}",
        candidate.get("description", ""),
    )
    if fallback == 0.0:
        return None, False, ""
    return fallback, False, "No text embedding - keyword overlap proxy"


def score_attributes(
    report: dict[str, Any], candidate: dict[str, Any]
) -> tuple[float, list[str], list[str]]:
    """Structured field agreement. Returns (score, agreements, conflicts)."""
    pa = report.get("itemProfile") or report.get("item_profile") or {}
    pb = candidate.get("itemProfile") or candidate.get("item_profile") or {}

    agreements: list[str] = []
    conflicts: list[str] = []
    scored = 0

    for field in ATTRIBUTE_FIELDS:
        left, right = normalise(pa.get(field)), normalise(pb.get(field))
        if not left or not right:
            continue
        scored += 1
        if left == right:
            agreements.append(field)
        elif field in ("primaryColor", "category", "brand"):
            # These three are near-decisive: same category but different brand
            # is a strong signal AGAINST a match.
            conflicts.append(field)

    if scored == 0:
        return 0.0, agreements, conflicts
    # Non-negative by contract: every signal in this module is a similarity in
    # [0,1] and the API renders it as a percentage. The old
    # `(agreements - conflicts) / scored` could reach -1 and surfaced in the UI
    # as "-100%", which is not a thing a reviewer can act on. A contradiction
    # is expressed by the field NOT counting as agreement, plus the hard cap
    # applied in score_pair() - not by inventing a negative similarity.
    return len(agreements) / scored, agreements, conflicts


def score_location(
    report: dict[str, Any], candidate: dict[str, Any]
) -> tuple[Optional[float], str]:
    """Haversine when coordinates exist, else free-text location similarity."""
    distance = haversine_km(
        report.get("coordinates") or report.get("coords"),
        candidate.get("coordinates") or candidate.get("coords"),
    )
    if distance is not None:
        # 0 km -> 1.0, 2 km -> ~0, linear between.
        return max(0.0, 1.0 - distance / 2.0), f"{distance:.2f} km apart"

    text_score = text_similarity(
        str(report.get("location", "")), str(candidate.get("location", ""))
    )
    if text_score == 0.0:
        return None, ""
    return text_score, "Same building or area (from location text)"


def score_time(
    report: dict[str, Any], candidate: dict[str, Any], window_days: int
) -> tuple[Optional[float], str]:
    """Closeness of the relevant dates. Same day scores highest."""
    left = relevant_date(report)
    right = relevant_date(candidate)
    if not left or not right:
        return None, ""

    delta_days = abs((left - right).total_seconds()) / 86400.0
    if delta_days > window_days:
        return 0.0, f"{delta_days:.1f} days apart (outside the {window_days}-day window)"
    score = max(0.0, 1.0 - delta_days / window_days)
    if delta_days < 0.042:  # ~1 hour
        return score, "Within an hour of each other"
    if delta_days < 1:
        return score, "On the same day"
    return score, f"{delta_days:.1f} days apart"


def score_context(
    report: dict[str, Any], candidate: dict[str, Any]
) -> tuple[float, str]:
    """Category agreement plus any cross-description term overlap."""
    cat_a = normalise(report.get("category"))
    cat_b = normalise(candidate.get("category"))
    if cat_a and cat_b and cat_a == cat_b:
        overlap = text_similarity(
            report.get("description", ""), candidate.get("description", "")
        )
        # Category agreement alone is weak evidence, so we cap it.
        return 0.6 + 0.4 * overlap, f"Same category ({cat_a})"
    if cat_a and cat_b:
        return 0.0, f"Different categories ({cat_a} vs {cat_b})"
    return 0.3, "Category not recorded"

# --------------------------------------------------------------------------
# cross-modal consistency
# --------------------------------------------------------------------------
# What the photos look like, what the text says and what the recorded attributes
# say are three independent views of the same item. When they point in different
# directions the honest output is a candidate flagged for a human - not one
# confident number that averages the disagreement away. Two reports sharing
# nothing but a category must not look like a strong match because one signal
# happened to be high.
CONSISTENCY_TOLERANCE = 0.35
CONSISTENCY_CAP = 70.0
CHECKED_SIGNALS = ("visual", "semantic", "attributes")


def score_consistency(
    signals: dict[str, Optional[float]],
    conflicts: list[str],
) -> dict[str, Any]:
    """Agreement between the independent signals for ONE pair.

    ``score`` is plain agreement (100 - spread). ``level`` says whether the
    disagreement is large enough to stop trusting the combined score, and
    ``contradictions`` names each specific disagreement in words a staff member
    can act on. ``review_required`` is what the caller should surface.
    """
    checked = {
        name: round(signals[name] * 100.0, 1)
        for name in CHECKED_SIGNALS
        if signals.get(name) is not None
    }
    visual = signals.get("visual")
    semantic = signals.get("semantic")
    attributes = signals.get("attributes")

    contradictions: list[str] = []
    if conflicts and visual is not None and visual >= 0.70:
        contradictions.append(
            "the photos look alike but the recorded brand or category conflicts "
            f"({', '.join(conflicts)})"
        )
    if visual is not None and semantic is not None:
        if visual <= 0.35 and semantic >= 0.70:
            contradictions.append(
                "the descriptions match strongly while the photos do not"
            )
        elif visual >= 0.70 and semantic <= 0.30:
            contradictions.append(
                "the photos match strongly while the descriptions do not"
            )
    if (
        attributes is not None
        and visual is not None
        and attributes >= 0.80
        and visual <= 0.35
    ):
        contradictions.append("the recorded attributes agree while the photos differ")
    if (
        attributes is not None
        and semantic is not None
        and attributes <= 0.20
        and semantic >= 0.70
    ):
        contradictions.append(
            "the descriptions match strongly while the recorded attributes differ"
        )

    if len(checked) < 2:
        spread = 0.0
        level = "insufficient"
    else:
        spread = round(max(checked.values()) - min(checked.values()), 1)
        if contradictions:
            level = "contradictory"
        elif spread >= CONSISTENCY_TOLERANCE * 100.0:
            level = "mixed"
        else:
            level = "consistent"

    return {
        "score": round(100.0 - spread, 1),
        "level": level,
        "spread": spread,
        "checked": checked,
        "contradictions": contradictions,
        "review_required": level == "contradictory",
    }


def band_for(score: float, high: float) -> str:
    if score >= high:
        return "high"
    if score >= 40.0:
        return "review"
    return "low"


def resolve_weights(overrides: Optional[dict[str, float]]) -> dict[str, float]:
    """Merge caller-supplied weights over the defaults, normalised to 1.0."""
    weights = {**DEFAULT_WEIGHTS}
    for key, value in (overrides or {}).items():
        if key in weights and isinstance(value, (int, float)) and value >= 0:
            weights[key] = float(value)
    total = sum(weights.values()) or 1.0
    return {k: v / total for k, v in weights.items()}


def score_pair(
    report: dict[str, Any],
    candidate: dict[str, Any],
    weights: dict[str, float],
    window_days: int = 14,
) -> dict[str, Any]:
    """Score one candidate against one report.

    Signals that could not be computed are listed in ``degraded`` and their
    weight is redistributed across the signals that DID compute, rather than
    being counted as zero.

    That redistribution matters: a missing SigLIP2 install should not collapse
    every score to near-zero and hide genuinely good text matches.
    """
    degraded: list[str] = []

    # Decisive shortcut: identical serial number means the same object.
    serial = serial_exact_match(report, candidate)
    if serial is True:
        return {
            "final_score": 99.0,
            "band": "high",
            "evidence": [
                {
                    "signal": "serial",
                    "label": "Serial Number",
                    "score": 1.0,
                    "weight": 1.0,
                    "contribution": 1.0,
                    "detail": "Both reports record the same serial number",
                    "model_backed": False,
                }
            ],
            "degraded": degraded,
            "serial_decisive": True,
            "consistency": {
                "score": 100.0,
                "level": "consistent",
                "spread": 0.0,
                "checked": {},
                "contradictions": [],
                "review_required": False,
            },
            "flags": [],
        }

    visual, visual_model, visual_detail = score_visual(report, candidate)
    semantic, semantic_model, semantic_detail = score_semantic(report, candidate)
    attribute_score, agreements, conflicts = score_attributes(report, candidate)
    location, location_detail = score_location(report, candidate)
    time_score, time_detail = score_time(report, candidate, window_days)
    context, context_detail = score_context(report, candidate)

    signals: dict[str, Optional[float]] = {
        "visual": visual,
        "semantic": semantic,
        "attributes": attribute_score,
        "location": location,
        "time": time_score,
        "context": context,
    }
    model_backed = {"visual": visual_model, "semantic": semantic_model}
    details = {
        "visual": visual_detail,
        "semantic": semantic_detail,
        "location": location_detail,
        "time": time_detail,
        "context": context_detail,
    }

    for signal, value in signals.items():
        if value is None:
            degraded.append(signal)

    # Renormalise over the signals we actually have.
    available = {k: v for k, v in signals.items() if v is not None}
    available_weight = sum(weights.get(k, 0.0) for k in available) or 1.0

    evidence: list[dict[str, Any]] = []
    final = 0.0
    for signal, value in available.items():
        weight = weights.get(signal, 0.0)
        contribution = (weight / available_weight) * value * 100.0
        final += contribution
        detail = details.get(signal, "")
        if signal == "attributes":
            detail = _attribute_detail(agreements, conflicts)
        evidence.append(
            {
                "signal": signal,
                "label": SIGNAL_LABELS.get(signal, signal),
                "score": round(value * 100.0, 1),
                "weight": round(weight, 4),
                "contribution": round(contribution, 1),
                "detail": detail,
                "model_backed": bool(model_backed.get(signal, False)),
            }
        )

    if conflicts:
        # A brand/category conflict is a hard cap, not a small penalty: a
        # Wildcraft bag is not an Adidas bag however similar the colours are.
        final = min(final, 62.0)

    if serial is False:
        # Both sides stated a serial and they differ.
        evidence.append(
            {
                "signal": "serial",
                "label": "Serial Number",
                "score": 0.0,
                "weight": 0.0,
                "contribution": 0.0,
                "detail": "Both reports record different serial numbers",
                "model_backed": False,
            }
        )
        final = min(final, 55.0)

    # Cross-modal consistency is computed BEFORE sorting so its row travels
    # with the evidence into the UI, and reported as `flags` so the backend can
    # route a contradictory pair to a human instead of trusting the score.
    consistency = score_consistency(
        {"visual": visual, "semantic": semantic, "attributes": attribute_score},
        conflicts,
    )
    flags: list[str] = []
    if consistency["level"] == "contradictory":
        # Not a small penalty: the signals disagree, so this pair is a question
        # for a reviewer, not a ranked answer.
        final = min(final, CONSISTENCY_CAP)
        flags.append("CROSS_MODAL_CONFLICT")
    if consistency["level"] == "insufficient":
        flags.append("PARTIAL_SIGNALS")
    if consistency["contradictions"]:
        evidence.append(
            {
                "signal": "consistency",
                "label": "Cross-modal consistency",
                "score": consistency["score"],
                "weight": 0.0,
                "contribution": 0.0,
                "detail": "Signals disagree: " + "; ".join(consistency["contradictions"]),
                "model_backed": False,
            }
        )

    evidence.sort(key=lambda e: e["contribution"], reverse=True)
    return {
        "final_score": round(max(0.0, min(100.0, final)), 1),
        "band": band_for(final, 85.0),
        "evidence": evidence,
        "degraded": degraded,
        "serial_decisive": False,
        "consistency": consistency,
        "flags": flags,
    }


def _attribute_detail(agreements: list[str], conflicts: list[str]) -> str:
    parts: list[str] = []
    if agreements:
        parts.append("Matching: " + ", ".join(agreements[:4]))
    if conflicts:
        parts.append("Conflicting: " + ", ".join(conflicts))
    return "; ".join(parts) or "No structured attributes in common"


def final_score_word(score: float) -> str:
    if score >= 85:
        return "high"
    if score >= 65:
        return "moderate"
    if score >= 40:
        return "low"
    return "very low"


def build_explanation(
    report: dict[str, Any], candidate: dict[str, Any], result: dict[str, Any]
) -> str:
    """Deterministic explanation built ONLY from computed evidence.

    This is the fallback whenever the VLM is absent or its output was rejected
    for citing unmeasured signals. Because it is assembled from the evidence
    rows themselves, it cannot invent a fact.
    """
    if result.get("serial_decisive"):
        return (
            "Both reports record the same serial number, which identifies one "
            "specific physical item. This is the strongest signal available, but "
            "it is still a candidate match and needs ownership verification."
        )

    profile = candidate.get("itemProfile") or candidate.get("item_profile") or {}
    name = profile.get("itemName") or candidate.get("category") or "the reported item"
    score = result.get("final_score", 0.0)
    lines = [f"Candidate match with {name} at {final_score_word(score)} confidence."]

    for row in [e for e in result.get("evidence", []) if e.get("score", 0) > 0][:3]:
        detail = row.get("detail")
        suffix = f" ({detail})" if detail else ""
        lines.append(f"- {row['label']}: {row['score']:.0f}%{suffix}")

    contradictions = (result.get("consistency") or {}).get("contradictions") or []
    if contradictions:
        lines.append(
            "Signals disagree, so a person should look at this pair: "
            + "; ".join(contradictions)
            + "."
        )

    degraded = [s for s in result.get("degraded", []) if s]
    if degraded:
        names = ", ".join(SIGNAL_LABELS.get(s, s) for s in degraded)
        lines.append(
            f"Not evaluated for this pair: {names}. "
            "Install the optional models to enable those signals."
        )
    if candidate.get("location") and report.get("location"):
        lines.append(
            f"Reported location: {report['location']} (lost) vs "
            f"{candidate['location']} (found)."
        )
    lines.append(
        "A match is a candidate recommendation for human review, not proof of ownership."
    )
    return "\n".join(lines)

