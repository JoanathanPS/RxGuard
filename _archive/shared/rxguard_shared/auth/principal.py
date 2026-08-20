"""Cross-service authentication.

`user-service` owns password hashing and token issuance; every other service
validates the bearer token against the shared JWT secret and gets a lightweight
`Principal` (user id + role) — no users table needed. This keeps auth uniform
across the fleet and is what the API gateway (Phase 5) and RBAC (Phase 3)
build on.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from rxguard_shared.auth.jwt import decode_token
from rxguard_shared.schemas.enums import Role

bearer_scheme = HTTPBearer(auto_error=False)

CredentialsDep = Annotated[
    HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
]


@dataclass(frozen=True)
class Principal:
    """Who the caller is, as asserted by user-service's JWT."""

    user_id: str
    role: Role


def _jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "change-me-to-a-long-random-string")


def get_principal(credentials: CredentialsDep = None) -> Principal:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token"
        )
    try:
        payload = decode_token(credentials.credentials, secret=_jwt_secret())
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from None
    return Principal(user_id=str(payload["sub"]), role=Role(payload["role"]))


PrincipalDep = Annotated[Principal, Depends(get_principal)]


def require_principal_role(*roles: Role):
    """Build a dependency that admits callers holding one of the given roles."""

    def _role_dependency(principal: PrincipalDep = None) -> Principal:
        if principal.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role for this operation",
            )
        return principal

    return _role_dependency
