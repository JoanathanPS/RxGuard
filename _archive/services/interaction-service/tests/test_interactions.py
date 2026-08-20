"""Interaction engine tests: N-ary coverage + seed matching (SQLite in-memory)."""

import pytest
from fastapi.testclient import TestClient
from rxguard_shared.auth.jwt import create_access_token
from rxguard_shared.db import Base
from rxguard_shared.schemas.enums import Role
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from interaction_app.db import db_session
from interaction_app.engines.ai_engine import run_ai_engine
from interaction_app.main import app

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture()
def client():
    Base.metadata.create_all(engine)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[db_session] = override_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)


@pytest.fixture()
def headers() -> dict:
    token = create_access_token("user-1", Role.CLINICIAN)
    return {"Authorization": f"Bearer {token}"}


# --- pure engine tests -------------------------------------------------------


def test_full_pair_generation_is_n_ary():
    # 4 drugs -> C(4,2) = 6 pairs (not just adjacent ones).
    results, _ = run_ai_engine(["Warfarin", "Aspirin", "Simvastatin", "Clarithromycin"])
    assert len(results) == 6


def test_known_high_severity_pair_detected():
    results, _ = run_ai_engine(["Warfarin", "Aspirin"])
    found = next(r for r in results if r["in_dataset"])
    assert found["severity"] == "high"
    assert found["confidence"] == 1.0
    assert found["source"] == "local"


def test_safe_pair_in_dataset():
    results, _ = run_ai_engine(["Amoxicillin", "Acetaminophen"])
    assert results[0]["severity"] == "safe"
    assert results[0]["in_dataset"] is True


def test_unmatched_pair_reports_low_confidence_safe():
    results, _ = run_ai_engine(["Warfarin", "Cetirizine"])  # not in seed
    assert results[0]["in_dataset"] is False
    assert results[0]["severity"] == "safe"
    assert results[0]["confidence"] == 0.5


def test_case_insensitive_matching():
    results, _ = run_ai_engine(["warfarin", "ASPIRIN"])
    assert results[0]["in_dataset"] is True


# --- API tests ---------------------------------------------------------------


def test_check_endpoint_requires_token(client):
    res = client.post(
        "/interactions/check",
        json={"drugs": [{"drug_name": "Warfarin"}, {"drug_name": "Aspirin"}]},
    )
    assert res.status_code == 401


def test_check_endpoint_returns_merged_results(client, headers):
    res = client.post(
        "/interactions/check",
        json={
            "prescription_id": 1,
            "drugs": [
                {"drug_name": "Warfarin"},
                {"drug_name": "Aspirin"},
                {"drug_name": "Amoxicillin"},
            ],
        },
        headers=headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["engine"] == "ai"
    assert body["drug_count"] == 3
    assert body["pairs_checked"] == 3
    severities = [r["severity"] for r in body["results"]]
    assert "high" in severities  # warfarin+aspirin
    assert "safe" in severities  # warfarin+amoxicillin, aspirin+amoxicillin
    assert body["detection_time_ms"] >= 0


def test_manual_engine_not_implemented_yet(client, headers):
    res = client.post(
        "/interactions/check-manual",
        json={"drugs": [{"drug_name": "Warfarin"}, {"drug_name": "Aspirin"}]},
        headers=headers,
    )
    assert res.status_code == 501
