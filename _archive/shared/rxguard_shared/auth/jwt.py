"""JWT creation/validation helpers (auth.py is authoritative in user-service).

The user-service owns password hashing and issues tokens; every other service
validates them with the same shared helpers so there is exactly one JWT format.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import jwt

from rxguard_shared.schemas.enums import Role

# Match python-jose defaults.
ALGORITHM = "HS256"


def _secret() -> str:
    return os.getenv("JWT_SECRET", "change-me-to-a-long-random-string")


def create_access_token(
    subject: str,
    role: Role | str,
    *,
    expires_minutes: int | None = None,
    secret: str | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    """Issue a signed JWT carrying the subject and role claims."""
    minutes = expires_minutes or int(os.getenv("JWT_EXPIRY_MINUTES", "60"))
    now = datetime.now(UTC)
    role_value = role.value if isinstance(role, Role) else role
    payload: dict[str, Any] = {
        "sub": subject,
        "role": str(role_value),
        "iat": now,
        "exp": now + timedelta(minutes=minutes),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, secret or _secret(), algorithm=ALGORITHM)


def decode_token(token: str, secret: str | None = None) -> dict[str, Any]:
    """Decode and validate a token, raising JWTError on failure."""
    return jwt.decode(token, secret or _secret(), algorithms=[ALGORITHM])


def token_subject(token: str, secret: str | None = None) -> str:
    """Return the subject (user id) of a validated token."""
    return str(decode_token(token, secret)["sub"])
