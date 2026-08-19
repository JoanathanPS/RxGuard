"""SQLAlchemy models for patient-service.

Per `prompt-patient-profile-addendum.md` §5, the original single
`medical_history JSONB` field is replaced with structured, queryable tables so
the Patient-Context Risk Engine (Phase 2) can reason over labs, conditions,
allergies, and lifestyle.
"""

from datetime import UTC, date, datetime

from rxguard_shared.db import Base
from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    age: Mapped[int | None] = mapped_column(Integer)
    gender: Mapped[str | None] = mapped_column(String(32))
    weight_kg: Mapped[float | None] = mapped_column(Float)
    height_cm: Mapped[float | None] = mapped_column(Float)
    pregnant: Mapped[bool | None] = mapped_column(default=None)
    breastfeeding: Mapped[bool | None] = mapped_column(default=None)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    conditions = relationship("PatientCondition", back_populates="patient", cascade="all, delete-orphan")
    allergies = relationship("PatientAllergy", back_populates="patient", cascade="all, delete-orphan")
    labs = relationship("PatientLab", back_populates="patient", cascade="all, delete-orphan")
    lifestyle = relationship("PatientLifestyle", back_populates="patient", cascade="all, delete-orphan", uselist=False)


class PatientCondition(Base):
    __tablename__ = "patient_conditions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    condition_name: Mapped[str] = mapped_column(String(255), nullable=False)
    diagnosed_date: Mapped[date | None] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(default=True)

    patient = relationship("Patient", back_populates="conditions")


class PatientAllergy(Base):
    __tablename__ = "patient_allergies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    allergen: Mapped[str] = mapped_column(String(255), nullable=False)
    reaction: Mapped[str | None] = mapped_column(String(255))
    severity: Mapped[str | None] = mapped_column(String(32))

    patient = relationship("Patient", back_populates="allergies")


class PatientLab(Base):
    __tablename__ = "patient_labs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    test_name: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[float | None] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String(32))
    recorded_at: Mapped[date | None] = mapped_column(Date)

    patient = relationship("Patient", back_populates="labs")


class PatientLifestyle(Base):
    __tablename__ = "patient_lifestyle"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), unique=True
    )
    smoking_status: Mapped[str | None] = mapped_column(String(32))
    alcohol_use: Mapped[str | None] = mapped_column(String(32))

    patient = relationship("Patient", back_populates="lifestyle")
