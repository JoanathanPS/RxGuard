"""Patient CRUD + profile sub-resource tests (SQLite in-memory)."""

import pytest
from fastapi.testclient import TestClient
from rxguard_shared.auth.jwt import create_access_token
from rxguard_shared.db import Base
from rxguard_shared.schemas.enums import Role
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from patient_app.db import db_session
from patient_app.main import app

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
def token() -> str:
    return create_access_token("user-1", Role.CLINICIAN)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_patient(client, token, **overrides):
    payload = {"name": "Jane Doe", "age": 68, "gender": "female", **overrides}
    return client.post("/patients", json=payload, headers=_auth(token))


def test_requires_token(client):
    assert client.post("/patients", json={"name": "x"}).status_code == 401


def test_create_and_list_patients(client, token):
    res = _create_patient(client, token)
    assert res.status_code == 201
    body = res.json()
    assert body["name"] == "Jane Doe"
    assert body["created_by"] == "user-1"

    res = client.get("/patients", headers=_auth(token))
    assert res.status_code == 200
    assert len(res.json()) == 1


def test_get_patient_profile(client, token):
    patient_id = _create_patient(client, token).json()["id"]
    res = client.get(f"/patients/{patient_id}", headers=_auth(token))
    assert res.status_code == 200
    body = res.json()
    assert body["age"] == 68
    assert body["conditions"] == []
    assert body["lifestyle"] is None


def test_update_patient(client, token):
    patient_id = _create_patient(client, token).json()["id"]
    res = client.put(
        f"/patients/{patient_id}", json={"weight_kg": 60.5}, headers=_auth(token)
    )
    assert res.status_code == 200
    assert res.json()["weight_kg"] == 60.5


def test_missing_patient_404(client, token):
    assert client.get("/patients/9999", headers=_auth(token)).status_code == 404


def test_profile_sub_resources_roundtrip(client, token):
    patient_id = _create_patient(client, token).json()["id"]

    cond = client.post(
        f"/patients/{patient_id}/conditions",
        json={"condition_name": "Type 2 diabetes", "active": True},
        headers=_auth(token),
    )
    assert cond.status_code == 201

    allergy = client.post(
        f"/patients/{patient_id}/allergies",
        json={"allergen": "Penicillin", "reaction": "rash", "severity": "moderate"},
        headers=_auth(token),
    )
    assert allergy.status_code == 201

    lab = client.post(
        f"/patients/{patient_id}/labs",
        json={"test_name": "eGFR", "value": 45.0, "unit": "mL/min"},
        headers=_auth(token),
    )
    assert lab.status_code == 201

    lifestyle = client.put(
        f"/patients/{patient_id}/lifestyle",
        json={"smoking_status": "never", "alcohol_use": "occasional"},
        headers=_auth(token),
    )
    assert lifestyle.status_code == 200

    profile = client.get(f"/patients/{patient_id}", headers=_auth(token)).json()
    assert [c["condition_name"] for c in profile["conditions"]] == ["Type 2 diabetes"]
    assert profile["allergies"][0]["allergen"] == "Penicillin"
    assert profile["labs"][0]["test_name"] == "eGFR"
    assert profile["lifestyle"]["smoking_status"] == "never"
