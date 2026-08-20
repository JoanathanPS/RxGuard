"""System (AI-assisted) Checking Engine — the real product (spec Module 2).

Phase 1: deterministic rule-based engine over the local seed dataset, with full
N-ary coverage (every drug pair combination is generated, not just adjacent
pairs). Each drug is standardized to a canonical name/RXCUI via the shared
catalog before lookup.

Phase 2 adds: the scikit-learn severity classifier for pairs the rule table
doesn't cover (source="ml"), and live OpenFDA/RxNorm enrichment (source=
"openfda") with the local dataset as fallback. The LLM never decides severity —
it only writes explanations (alert-service, Phase 2).
"""

from __future__ import annotations

import itertools
import time

from rxguard_shared.data import load_interactions, normalize_name

from interaction_app.core.engine import standardize_drugs


def _result_for_pair(a: str, b: str, interactions: dict) -> dict:
    """Look up one canonical pair in the seed dataset."""
    key = tuple(sorted((normalize_name(a), normalize_name(b))))
    row = interactions.get(key)
    if row is not None:
        return {
            "drug_a": a,
            "drug_b": b,
            "severity": row["severity"],
            "mechanism": row["mechanism"],
            "action": row["action"],
            "source": "local",
            "confidence": 1.0,
            "in_dataset": True,
        }
    return {
        "drug_a": a,
        "drug_b": b,
        "severity": "safe",
        "mechanism": "No interaction found in the local reference dataset.",
        "action": None,
        "source": "local",
        "confidence": 0.5,
        "in_dataset": False,
    }


def run_ai_engine(drug_names: list[str]) -> tuple[list[dict], float]:
    """Run the AI-assisted engine over all drug pairs.

    Returns (results, detection_time_ms). Pair generation is the full N-ary
    coverage (itertools.combinations over every drug, r=2).
    """
    start = time.perf_counter()
    canonical = standardize_drugs(drug_names)
    names = [drug["canonical"] for drug in canonical]
    interactions = load_interactions()

    results: list[dict] = []
    for a, b in itertools.combinations(names, 2):
        results.append(_result_for_pair(a, b, interactions))

    elapsed_ms = (time.perf_counter() - start) * 1000.0
    return results, elapsed_ms
