"""Prescription + drug search tests (SQLite in-memory)."""

import pytest
from fastapi.testclient import TestClient
from rxguard_shared.auth.jwt import create_access_token
from rxguard_shared.db import Base
from rxguard_shared.schemas.enums import Role
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from prescription_app.db import db_session
from prescription_app.main import app

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


def _prescription(items, **overrides):
    payload = {"patient_id": 1, "items": items, **overrides}
    return payload


def test_create_prescription_standardizes_drugs(client, headers):
    res = client.post(
        "/prescriptions",
        json=_prescription(
            [
                {"drug_name": "Warfarin", "dosage": "5mg", "route": "oral"},
                {"drug_name": "Aspirin", "dosage": "75mg", "route": "oral"},
            ]
        ),
        headers=headers,
    )
    assert res.status_code == 201
    body = res.json()
    assert body["clinician_id"] == "user-1"
    items = {i["drug_name"]: i for i in body["items"]}
    assert items["Warfarin"]["rxcui"] == "11289"
    assert items["Warfarin"]["route"] == "oral"


def test_rejects_duplicate_medication(client, headers):
    res = client.post(
        "/prescriptions",
        json=_prescription(
            [
                {"drug_name": "Aspirin", "dosage": "75mg", "route": "oral"},
                {"drug_name": "aspirin", "dosage": "300mg", "route": "oral"},
            ]
        ),
        headers=headers,
    )
    assert res.status_code == 422
    assert "Duplicate" in res.json()["detail"]


def test_rejects_unknown_route(client, headers):
    res = client.post(
        "/prescriptions",
        json=_prescription([{"drug_name": "Aspirin", "route": "by-mouth"}]),
        headers=headers,
    )
    assert res.status_code == 422


def test_rejects_empty_prescription(client, headers):
    res = client.post("/prescriptions", json=_prescription([]), headers=headers)
    assert res.status_code == 422


def test_unmapped_drug_gets_null_rxcui(client, headers):
    res = client.post(
        "/prescriptions",
        json=_prescription([{"drug_name": "FancyBrandX", "route": "oral"}]),
        headers=headers,
    )
    assert res.status_code == 201
    assert res.json()["items"][0]["rxcui"] is None


def test_get_prescription(client, headers):
    rx_id = client.post(
        "/prescriptions",
        json=_prescription([{"drug_name": "Warfarin", "route": "oral"}]),
        headers=headers,
    ).json()["id"]
    res = client.get(f"/prescriptions/{rx_id}", headers=headers)
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1


def test_list_patient_prescriptions(client, headers):
    client.post(
        "/prescriptions", json=_prescription([{"drug_name": "Warfarin"}]), headers=headers
    )
    res = client.get("/prescriptions/patients/1/prescriptions", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 1


def test_drug_search_local_catalog(client, headers):
    res = client.get("/drugs/search", params={"q": "war"}, headers=headers)
    assert res.status_code == 200
    names = [d["name"] for d in res.json()]
    assert "warfarin" in names
    assert res.json()[0]["rxcui"] == "11289"


def test_drug_search_requires_token(client):
    assert client.get("/drugs/search", params={"q": "war"}).status_code == 401
