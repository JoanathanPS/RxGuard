"""Prescription routes (spec §6: POST /prescriptions, GET /prescriptions/{id},
GET /patients/{id}/prescriptions).

Module 1 validation: duplicate-drug detection and route normalization happen
here, before anything reaches the interaction engine.
"""

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from prescription_app.api.deps import DbDep, PrincipalDep
from prescription_app.core.drug_catalog import standardize
from prescription_app.models import Prescription, PrescriptionItem
from prescription_app.schemas import (
    ROUTES,
    PrescriptionCreate,
    PrescriptionItemIn,
    PrescriptionOut,
    normalize_route,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_prescription_or_404(db: Session, prescription_id: int) -> Prescription:
    prescription = db.scalar(
        select(Prescription)
        .where(Prescription.id == prescription_id)
        .options(selectinload(Prescription.items))
    )
    if prescription is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Prescription not found"
        )
    return prescription


def _validate_items(items: list[PrescriptionItemIn]) -> list[PrescriptionItem]:
    """Normalize routes, standardize drug names to RXCUI, and reject duplicates.

    Returns ready-to-attach ORM rows; raises HTTP 422 on validation problems.
    """
    seen: dict[str, PrescriptionItemIn] = {}
    for item in items:
        key = item.normalized_name
        if key in seen:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Duplicate medication '{item.drug_name}' — remove the duplicate "
                "before checking interactions",
            )
        seen[key] = item

    rows: list[PrescriptionItem] = []
    for item in items:
        route = None
        if item.route is not None:
            route = normalize_route(item.route)
            if route not in ROUTES:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Unknown route '{item.route}'. Allowed: {sorted(ROUTES)}",
                )
        mapping = standardize(item.drug_name)
        if mapping is None:
            logger.warning("unstandardized drug in prescription", extra={"drug": item.drug_name})
        rows.append(
            PrescriptionItem(
                drug_name=item.drug_name.strip(),
                rxcui=mapping["rxcui"] if mapping else None,
                dosage=item.dosage,
                route=route,
            )
        )
    return rows


@router.post("", response_model=PrescriptionOut, status_code=status.HTTP_201_CREATED)
def create_prescription(
    payload: PrescriptionCreate, db: DbDep = None, principal: PrincipalDep = None
) -> Prescription:
    items = _validate_items(payload.items)
    prescription = Prescription(
        patient_id=payload.patient_id,
        clinician_id=principal.user_id,
        status=payload.status,
        items=items,
    )
    db.add(prescription)
    db.commit()
    db.refresh(prescription)
    logger.info(
        "prescription created",
        extra={"entity_id": prescription.id, "user_id": principal.user_id},
    )
    return prescription


@router.get("/{prescription_id}", response_model=PrescriptionOut)
def get_prescription(
    prescription_id: int, db: DbDep = None, _: PrincipalDep = None
) -> Prescription:
    return _get_prescription_or_404(db, prescription_id)


@router.get("/patients/{patient_id}/prescriptions", response_model=list[PrescriptionOut])
def list_patient_prescriptions(
    patient_id: int, db: DbDep = None, _: PrincipalDep = None
) -> list[Prescription]:
    return list(
        db.scalars(
            select(Prescription)
            .where(Prescription.patient_id == patient_id)
            .options(selectinload(Prescription.items))
            .order_by(Prescription.created_at.desc())
        ).all()
    )
