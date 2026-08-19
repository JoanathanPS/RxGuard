"""Patient-service application."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from rxguard_shared.db import make_session_factory
from rxguard_shared.logging import setup_logging
from rxguard_shared.schemas.common import HealthResponse
from sqlalchemy import text

from patient_app.api.router import api_router
from patient_app.core.config import get_settings

settings = get_settings()
setup_logging(service=settings.service_name)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.database_url.startswith("postgresql"):
        factory = make_session_factory(settings.database_url)
        with factory() as session:
            session.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{settings.schema_name}"'))
            session.commit()
    yield


app = FastAPI(
    title="RxGuard Patient Service",
    description="Patient profile management (age, gender, medical history).",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", response_model=HealthResponse, tags=["ops"], include_in_schema=False)
def health() -> HealthResponse:
    return HealthResponse(service=settings.service_name)


@app.get("/metrics", tags=["ops"], include_in_schema=False)
def metrics() -> JSONResponse:
    return JSONResponse({"service": settings.service_name, "instrumentation": "pending"})
