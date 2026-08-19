"""Pydantic schemas for patient-service."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field
from rxguard_shared.schemas.enums import Severity


class PatientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    age: int | None = Field(default=None, ge=0, le=130)
    gender: str | None = None
    weight_kg: float | None = Field(default=None, gt=0)
    height_cm: float | None = Field(default=None, gt=0)
    pregnant: bool | None = None
    breastfeeding: bool | None = None


class PatientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    age: int | None = Field(default=None, ge=0, le=130)
    gender: str | None = None
    weight_kg: float | None = Field(default=None, gt=0)
    height_cm: float | None = Field(default=None, gt=0)
    pregnant: bool | None = None
    breastfeeding: bool | None = None


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    age: int | None
    gender: str | None
    weight_kg: float | None
    height_cm: float | None
    pregnant: bool | None
    breastfeeding: bool | None
    created_by: str
    created_at: datetime


class ConditionIn(BaseModel):
    condition_name: str = Field(min_length=1, max_length=255)
    diagnosed_date: date | None = None
    active: bool = True


class ConditionOut(ConditionIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int


class AllergyIn(BaseModel):
    allergen: str = Field(min_length=1, max_length=255)
    reaction: str | None = None
    severity: Severity | None = None


class AllergyOut(AllergyIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int


class LabIn(BaseModel):
    test_name: str = Field(min_length=1, max_length=64)
    value: float | None = None
    unit: str | None = None
    recorded_at: date | None = None


class LabOut(LabIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int


class LifestyleIn(BaseModel):
    smoking_status: str | None = None
    alcohol_use: str | None = None


class LifestyleOut(LifestyleIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int


class PatientProfileOut(PatientOut):
    """Full patient picture used by the Phase 2 risk engine."""

    conditions: list[ConditionOut] = []
    allergies: list[AllergyOut] = []
    labs: list[LabOut] = []
    lifestyle: LifestyleOut | None = None
