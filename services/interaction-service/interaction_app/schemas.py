"""Pydantic schemas for interaction-service."""

from pydantic import BaseModel, Field
from rxguard_shared.schemas.enums import Engine, Severity, Source


class DrugIn(BaseModel):
    drug_name: str = Field(min_length=1, max_length=255)


class CheckRequest(BaseModel):
    patient_id: int | None = None
    prescription_id: int | None = None
    drugs: list[DrugIn] = Field(min_length=2, max_length=50)


class InteractionResultOut(BaseModel):
    drug_a: str
    drug_b: str
    severity: Severity
    mechanism: str
    action: str | None
    source: Source
    confidence: float
    in_dataset: bool


class CheckResponse(BaseModel):
    prescription_id: int | None
    patient_id: int | None
    engine: Engine
    drug_count: int
    pairs_checked: int
    detection_time_ms: float
    results: list[InteractionResultOut]
