"""Top-level API router for patient-service."""

from fastapi import APIRouter

from patient_app.api.routes import patient_profile, patients

api_router = APIRouter()
api_router.include_router(patients.router, prefix="/patients", tags=["patients"])
api_router.include_router(
    patient_profile.router, prefix="/patients", tags=["patients profile"]
)
