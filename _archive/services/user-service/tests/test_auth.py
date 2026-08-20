"""Auth flow tests for user-service.

Uses an in-memory SQLite database with the `db_session` dependency overridden,
so no Postgres is required. Lint of the rule engine/validation logic stays
portable by design (roles stored as plain strings).
"""

import pytest
from fastapi.testclient import TestClient
from rxguard_shared.db import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from user_app.db import db_session
from user_app.main import app

# StaticPool keeps a single connection so the in-memory database is shared by
# every session created during a test run.
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


def _register(client, email="clin@rxguard.dev", password="password123", role="clinician"):
    return client.post(
        "/auth/register",
        json={"email": email, "name": "Clin", "password": password, "role": role},
    )


def test_register_returns_token_and_user(client):
    res = _register(client)
    assert res.status_code == 201
    body = res.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["email"] == "clin@rxguard.dev"
    assert body["user"]["role"] == "clinician"
    assert "password" not in body["user"]


def test_register_rejects_duplicate_email(client):
    _register(client)
    res = _register(client)
    assert res.status_code == 409


def test_login_roundtrip(client):
    _register(client)
    res = client.post(
        "/auth/login", json={"email": "clin@rxguard.dev", "password": "password123"}
    )
    assert res.status_code == 200
    assert res.json()["access_token"]


def test_login_rejects_wrong_password(client):
    _register(client)
    res = client.post(
        "/auth/login", json={"email": "clin@rxguard.dev", "password": "wrong-password"}
    )
    assert res.status_code == 401


def test_me_requires_token(client):
    assert client.get("/users/me").status_code == 401


def test_me_returns_profile(client):
    token = _register(client).json()["access_token"]
    res = client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["email"] == "clin@rxguard.dev"


def test_users_list_gated_by_admin(client):
    clinician_token = _register(client).json()["access_token"]
    # A clinician cannot list all users.
    res = client.get("/users", headers={"Authorization": f"Bearer {clinician_token}"})
    assert res.status_code == 403
    # An admin can.
    admin_token = _register(
        client, email="admin@rxguard.dev", role="admin"
    ).json()["access_token"]
    res = client.get("/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    assert len(res.json()) == 2
