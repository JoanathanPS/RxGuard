"""Patient profile sub-resources: labs, conditions, allergies, lifestyle.

Addendum §6: POST/GET /patients/{id}/labs|conditions|allergies, plus lifestyle.
"""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from patient_app.api.deps import DbDep, PrincipalDep
from patient_app.models import (
    Patient,
    PatientAllergy,
    PatientCondition,
    PatientLab,
    PatientLifestyle,
)
from patient_app.schemas import (
    AllergyIn,
    AllergyOut,
    ConditionIn,
    ConditionOut,
    LabIn,
    LabOut,
    LifestyleIn,
    LifestyleOut,
)

router = APIRouter()


def _get_patient_or_404(db: Session, patient_id: int) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient


@router.get("/{patient_id}/conditions", response_model=list[ConditionOut])
def list_conditions(patient_id: int, db: DbDep = None, _: PrincipalDep = None):
    _get_patient_or_404(db, patient_id)
    return list(
        db.scalars(select(PatientCondition).where(PatientCondition.patient_id == patient_id)).all()
    )


@router.post("/{patient_id}/conditions", response_model=ConditionOut, status_code=201)
def add_condition(
    patient_id: int, payload: ConditionIn, db: DbDep = None, _: PrincipalDep = None
):
    _get_patient_or_404(db, patient_id)
    item = PatientCondition(patient_id=patient_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{patient_id}/allergies", response_model=list[AllergyOut])
def list_allergies(patient_id: int, db: DbDep = None, _: PrincipalDep = None):
    _get_patient_or_404(db, patient_id)
    return list(
        db.scalars(select(PatientAllergy).where(PatientAllergy.patient_id == patient_id)).all()
    )


@router.post("/{patient_id}/allergies", response_model=AllergyOut, status_code=201)
def add_allergy(
    patient_id: int, payload: AllergyIn, db: DbDep = None, _: PrincipalDep = None
):
    _get_patient_or_404(db, patient_id)
    item = PatientAllergy(patient_id=patient_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{patient_id}/labs", response_model=list[LabOut])
def list_labs(patient_id: int, db: DbDep = None, _: PrincipalDep = None):
    _get_patient_or_404(db, patient_id)
    return list(db.scalars(select(PatientLab).where(PatientLab.patient_id == patient_id)).all())


@router.post("/{patient_id}/labs", response_model=LabOut, status_code=201)
def add_lab(patient_id: int, payload: LabIn, db: DbDep = None, _: PrincipalDep = None):
    _get_patient_or_404(db, patient_id)
    item = PatientLab(patient_id=patient_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{patient_id}/lifestyle", response_model=LifestyleOut | None)
def get_lifestyle(patient_id: int, db: DbDep = None, _: PrincipalDep = None):
    _get_patient_or_404(db, patient_id)
    return db.scalar(
        select(PatientLifestyle).where(PatientLifestyle.patient_id == patient_id)
    )


@router.put("/{patient_id}/lifestyle", response_model=LifestyleOut)
def upsert_lifestyle(
    patient_id: int, payload: LifestyleIn, db: DbDep = None, _: PrincipalDep = None
):
    _get_patient_or_404(db, patient_id)
    row = db.scalar(select(PatientLifestyle).where(PatientLifestyle.patient_id == patient_id))
    if row is None:
        row = PatientLifestyle(patient_id=patient_id)
        db.add(row)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row
