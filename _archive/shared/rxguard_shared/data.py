"""Loaders for the local curated datasets under `data/`.

These files are the rule-engine source, the live-API fallback (Phase 2), and the
ground truth for the comparative evaluation (Phase 4):
- drug_mapping.csv         drug name -> RXCUI -> class -> ML feature flags
- interactions_seed.csv    drug pair -> severity/mechanism/action
- drug_patient_risk_rules.csv  drug + patient factor -> verdict (Phase 2)
"""

from __future__ import annotations

import csv
import os
from functools import lru_cache
from pathlib import Path

MAPPING_FILE = "drug_mapping.csv"
INTERACTIONS_FILE = "interactions_seed.csv"
PATIENT_RISK_FILE = "drug_patient_risk_rules.csv"


def find_data_dir() -> Path:
    """Locate the repo `data/` directory from anywhere (dev, tests, Docker).

    Resolution order:
    1. $RXGUARD_DATA_DIR if set (explicit override).
    2. Walk up from the current working directory (Docker images copy `data/`
       to /app/data and services run from /app/service).
    3. Walk up from the shared package location (host dev / repo checkout).
    """
    override = os.environ.get("RXGUARD_DATA_DIR")
    if override:
        candidate = Path(override).resolve()
        if (candidate / MAPPING_FILE).exists():
            return candidate
    for start in [Path.cwd(), Path(__file__).resolve()]:
        for parent in [start, *start.parents]:
            candidate = parent / "data"
            if (candidate / MAPPING_FILE).exists():
                return candidate
    raise RuntimeError(
        f"could not locate {MAPPING_FILE}; set RXGUARD_DATA_DIR or run from the repo root"
    )


@lru_cache(maxsize=1)
def load_drug_mapping() -> dict[str, dict[str, str]]:
    """Return {normalized_name: row} for every drug in the catalog."""
    mapping: dict[str, dict[str, str]] = {}
    with open(find_data_dir() / MAPPING_FILE, encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            mapping[row["drug_name"].strip().lower()] = row
    return mapping


def normalize_name(name: str) -> str:
    return name.strip().lower()


def standardize(name: str) -> dict[str, str] | None:
    """Map a free-text drug name to its catalog row (incl. RXCUI), or None."""
    return load_drug_mapping().get(normalize_name(name))


def search_drugs(query: str, limit: int = 20) -> list[dict[str, str]]:
    """Substring search over the local catalog, by name and class."""
    q = normalize_name(query)
    if not q:
        return []
    matches = [
        row
        for row in load_drug_mapping().values()
        if q in row["drug_name"].lower() or q in row["drug_class"].lower()
    ]
    matches.sort(key=lambda row: (0 if row["drug_name"].startswith(q) else 1, row["drug_name"]))
    return matches[:limit]


def _canonical_pair(a: str, b: str) -> tuple[str, str]:
    return tuple(sorted((normalize_name(a), normalize_name(b))))


@lru_cache(maxsize=1)
def load_interactions() -> dict[tuple[str, str], dict[str, str]]:
    """Return {(canonical_a, canonical_b): row} for every seed pair."""
    interactions: dict[tuple[str, str], dict[str, str]] = {}
    with open(find_data_dir() / INTERACTIONS_FILE, encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            interactions[_canonical_pair(row["drug_a"], row["drug_b"])] = row
    return interactions


@lru_cache(maxsize=1)
def load_patient_risk_rules() -> list[dict[str, str]]:
    """Return the drug-patient risk rule rows (used by Phase 2 engine)."""
    with open(find_data_dir() / PATIENT_RISK_FILE, encoding="utf-8") as handle:
        return [dict(row) for row in csv.DictReader(handle)]
