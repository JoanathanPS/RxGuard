"""Manual-Simulated Checking Engine — a deliberately "manual-like" baseline.

This engine intentionally mirrors how a clinician manually checks a prescription
against a reference/formulary database:

- Looks up interactions **only** via direct pairwise lookups against the static
  local reference dataset (spec Module 2, §2).
- No ML, no LLM, no fuzzy/partial matching, no live APIs.
- No N-ary reasoning beyond explicit pairs in the table — this deliberately
  mirrors the deck's Problem Statement claim that manual/reference-based
  checking "doesn't scale with more drugs" and can miss multi-drug risk.
- A simulated per-pair lookup latency is added (Phase 4) so the time-to-check
  comparison in Module 4 is meaningful rather than trivially "0ms vs 200ms".

Implementing in Phase 4 (spec build order step 5). The module boundary exists
now so the two engine code paths stay provably separate.
"""

from __future__ import annotations


def run_manual_engine(drug_names: list[str]) -> tuple[list[dict], float]:
    raise NotImplementedError(
        "Manual-Simulated engine is implemented in Phase 4 (Comparative Evaluation)."
    )
