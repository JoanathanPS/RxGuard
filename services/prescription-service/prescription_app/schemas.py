"""Pydantic schemas for prescription-service."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

ROUTES = frozenset(
    {
        "oral",
        "intravenous",
        "intramuscular",
        "subcutaneous",
        "topical",
        "inhalation",
        "ophthalmic",
        "otic",
        "rectal",
        "sublingual",
        "transdermal",
        "vaginal",
    }
)


def normalize_route(route: str) -> str:
    return route.strip().lower().replace(" ", "").replace("-", "")


class PrescriptionItemIn(BaseModel):
    drug_name: str = Field(min_length=1, max_length=255)
    dosage: str | None = None
    route: str | None = None

    @property
    def normalized_name(self) -> str:
        return self.drug_name.strip().lower()


class PrescriptionCreate(BaseModel):
    patient_id: int
    status: str = Field(default="active", pattern=r"^(active|completed|cancelled)$")
    items: list[PrescriptionItemIn] = Field(min_length=1, max_length=50)


class PrescriptionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    drug_name: str
    rxcui: str | None
    dosage: str | None
    route: str | None


class PrescriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int
    clinician_id: str
    status: str
    created_at: datetime
    items: list[PrescriptionItemOut] = []


class DrugSearchResult(BaseModel):
    name: str
    rxcui: str
    drug_class: str
