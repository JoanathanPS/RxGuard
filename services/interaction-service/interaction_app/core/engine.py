"""Shared engine internals for interaction-service."""

from rxguard_shared.data import normalize_name, standardize


def standardize_drugs(drug_names: list[str]) -> list[dict[str, str]]:
    """Resolve free-text names to canonical names + RXCUI where known."""
    out = []
    for name in drug_names:
        mapping = standardize(name)
        out.append(
            {
                "original": name,
                "canonical": normalize_name(name),
                "rxcui": mapping["rxcui"] if mapping else None,
            }
        )
    return out
