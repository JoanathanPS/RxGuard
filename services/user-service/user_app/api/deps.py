"""Auth dependencies: bearer-token resolution and RBAC gating."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from rxguard_shared.auth.jwt import decode_token
from rxguard_shared.schemas.enums import Role
from sqlalchemy.orm import Session

from user_app.core.config import get_settings
from user_app.db import db_session
from user_app.models import User

bearer_scheme = HTTPBearer(auto_error=False)

CredentialsDep = Annotated[
    HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
]
DbDep = Annotated[Session, Depends(db_session)]


def get_current_user(
    credentials: CredentialsDep = None,
    db: DbDep = None,
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token"
        )
    settings = get_settings()
    try:
        payload = decode_token(credentials.credentials, secret=settings.jwt_secret)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from None
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists"
        )
    return user


def require_role(*roles: Role):
    """Build a dependency that only admits users holding one of the given roles."""

    def _role_dependency(user: Annotated[User, Depends(get_current_user)] = None) -> User:
        if Role(user.role) not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role for this operation",
            )
        return user

    return _role_dependency


UserDep = Annotated[User, Depends(get_current_user)]
AdminDep = Annotated[User, Depends(require_role(Role.ADMIN))]
