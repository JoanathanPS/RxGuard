"""Top-level API router for interaction-service."""

from fastapi import APIRouter

from interaction_app.api.routes import interactions

api_router = APIRouter()
api_router.include_router(interactions.router, prefix="/interactions", tags=["interactions"])
