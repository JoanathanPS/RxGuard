"""Top-level API router for prescription-service."""

from fastapi import APIRouter

from prescription_app.api.routes import drugs, prescriptions

api_router = APIRouter()
api_router.include_router(prescriptions.router, prefix="/prescriptions", tags=["prescriptions"])
api_router.include_router(drugs.router, prefix="/drugs", tags=["drugs"])
