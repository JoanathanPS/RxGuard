"""Registration and login routes (spec §6: POST /auth/register, POST /auth/login)."""


from fastapi import APIRouter, HTTPException, status
from rxguard_shared.auth.jwt import create_access_token
from rxguard_shared.schemas.common import ApiError, ErrorResponse
from sqlalchemy import select

from user_app.api.deps import DbDep
from user_app.core.config import get_settings
from user_app.core.security import hash_password, verify_password
from user_app.models import User
from user_app.schemas import TokenResponse, UserCreate, UserLogin

router = APIRouter()


def _issue_token(user: User) -> TokenResponse:
    settings = get_settings()
    access_token = create_access_token(
        str(user.id),
        role=user.role,  # stored as a string; helper accepts Role | str
        expires_minutes=settings.jwt_expiry_minutes,
        secret=settings.jwt_secret,
    )
    return TokenResponse(access_token=access_token, user=user)  # type: ignore[arg-type]


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: DbDep = None) -> TokenResponse:
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ErrorResponse(
                error=ApiError(code="email_taken", message="Email already registered")
            ).model_dump(),
        )
    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        role=payload.role.value,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _issue_token(user)


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: DbDep = None) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ErrorResponse(
                error=ApiError(code="invalid_credentials", message="Invalid email or password")
            ).model_dump(),
        )
    return _issue_token(user)
