"""Operational endpoint tests (Phase 0 scaffold)."""

from fastapi.testclient import TestClient

from interaction_app.main import app

client = TestClient(app)


def test_health_returns_ok():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "interaction-service"


def test_metrics_stub_responds():
    res = client.get("/metrics")
    assert res.status_code == 200
    assert res.json()["service"] == "interaction-service"
