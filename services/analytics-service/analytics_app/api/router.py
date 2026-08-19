"""Top-level API router.

Phase 1 registers auth/user routes here, e.g.:

    from analytics_app.api.routes import auth
    api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
"""

from fastapi import APIRouter

api_router = APIRouter()
