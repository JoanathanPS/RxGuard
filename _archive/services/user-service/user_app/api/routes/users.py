"""User listing routes (spec §6: GET /users/me, GET /users admin)."""

from fastapi import APIRouter
from sqlalchemy import select

from user_app.api.deps import AdminDep, DbDep, UserDep
from user_app.models import User
from user_app.schemas import UserOut

router = APIRouter()


@router.get("/me", response_model=UserOut)
def me(user: UserDep = None) -> User:
    return user


@router.get("", response_model=list[UserOut])
def list_users(_: AdminDep = None, db: DbDep = None) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id)).all())
