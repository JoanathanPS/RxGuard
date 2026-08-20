"""Shared request/response envelopes.

A single, consistent error schema across all services makes the API gateway
(Phase 5) and the frontend's error handling uniform.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class ApiError(BaseModel):
    """Machine-readable error payload."""

    code: str
    message: str
    details: dict[str, Any] | None = None


class ErrorResponse(BaseModel):
    """Standard error envelope: `{"error": {...}}`."""

    error: ApiError


class HealthResponse(BaseModel):
    """Standard `/health` payload every service returns."""

    status: Literal["ok"] = "ok"
    service: str
    version: str = "0.1.0"

    model_config = ConfigDict(protected_namespaces=())


class Meta(BaseModel):
    """Pagination/result metadata for list endpoints."""

    total: int
    page: int = 1
    page_size: int = 50
