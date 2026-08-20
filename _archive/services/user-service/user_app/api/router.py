"""Top-level API router for user-service."""

from fastapi import APIRouter

from user_app.api.routes import auth, users

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
