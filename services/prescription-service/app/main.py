"""FastAPI application factory for prescription-service.

Phase 0 ships the bare operational surface: `/health` and a `/metrics`
placeholder. Auth routes arrive in Phase 1.
"""

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from rxguard_shared.logging import setup_logging
from rxguard_shared.schemas.common import HealthResponse

from app.api.router import api_router
from app.core.config import get_settings

settings = get_settings()
setup_logging(service=settings.service_name)

app = FastAPI(
    title="RxGuard Prescription Service",
    description="Prescription and medication entry, drug search/autocomplete, prescription history.",
    version="0.1.0",
)

app.include_router(api_router)


@app.get("/health", response_model=HealthResponse, tags=["ops"], include_in_schema=False)
def health() -> HealthResponse:
    return HealthResponse(service=settings.service_name)


@app.get("/metrics", tags=["ops"], include_in_schema=False)
def metrics() -> JSONResponse:
    # Prometheus instrumentation (prometheus-fastapi-instrumentator) lands in
    # Phase 6; this placeholder keeps the endpoint contract stable.
    return JSONResponse({"service": settings.service_name, "instrumentation": "pending"})
