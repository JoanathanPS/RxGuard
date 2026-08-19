"""Patient CRUD routes (spec §6: GET/POST /patients, GET/PUT /patients/{id})."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from patient_app.api.deps import DbDep, PrincipalDep
from patient_app.models import Patient
from patient_app.schemas import PatientCreate, PatientOut, PatientProfileOut, PatientUpdate

router = APIRouter()


def _get_patient_or_404(db: Session, patient_id: int) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient


@router.get("", response_model=list[PatientOut])
def list_patients(db: DbDep = None, _: PrincipalDep = None) -> list[Patient]:
    return list(db.scalars(select(Patient).order_by(Patient.id)).all())


@router.post("", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
def create_patient(
    payload: PatientCreate, db: DbDep = None, principal: PrincipalDep = None
) -> Patient:
    patient = Patient(**payload.model_dump(), created_by=principal.user_id)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@router.get("/{patient_id}", response_model=PatientProfileOut)
def get_patient(patient_id: int, db: DbDep = None, _: PrincipalDep = None) -> Patient:
    patient = db.scalar(
        select(Patient)
        .where(Patient.id == patient_id)
        .options(
            selectinload(Patient.conditions),
            selectinload(Patient.allergies),
            selectinload(Patient.labs),
            selectinload(Patient.lifestyle),
        )
    )
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient


@router.put("/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: int, payload: PatientUpdate, db: DbDep = None, _: PrincipalDep = None
) -> Patient:
    patient = _get_patient_or_404(db, patient_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient
