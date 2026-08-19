"""Tests for the shared package (enums, JWT helpers, common schemas)."""

from jose import JWTError
from pydantic import ValidationError

from rxguard_shared.auth.jwt import create_access_token, decode_token
from rxguard_shared.schemas.common import ErrorResponse
from rxguard_shared.schemas.enums import Role, Severity


def test_role_values_are_lowercase_slug():
    assert set(r.value for r in Role) == {"clinician", "pharmacist", "researcher", "admin"}


def test_severity_values_cover_spec_levels():
    assert set(s.value for s in Severity) == {"critical", "high", "moderate", "low", "safe"}


def test_jwt_roundtrip_carries_role_claim():
    token = create_access_token("user-1", Role.CLINICIAN, expires_minutes=5, secret="test-secret")
    payload = decode_token(token, secret="test-secret")
    assert payload["sub"] == "user-1"
    assert payload["role"] == "clinician"


def test_jwt_rejects_bad_secret():
    token = create_access_token("user-1", Role.ADMIN, secret="test-secret")
    try:
        decode_token(token, secret="wrong-secret")
    except JWTError:
        pass
    else:
        raise AssertionError("expected JWTError for wrong secret")


def test_error_response_schema():
    err = ErrorResponse.model_validate(
        {"error": {"code": "not_found", "message": "nope", "details": {"id": 1}}}
    )
    assert err.error.code == "not_found"
    assert err.error.details == {"id": 1}


def test_error_response_requires_message():
    try:
        ErrorResponse.model_validate({"error": {"code": "x"}})
    except ValidationError:
        pass
    else:
        raise AssertionError("expected ValidationError for missing message")
