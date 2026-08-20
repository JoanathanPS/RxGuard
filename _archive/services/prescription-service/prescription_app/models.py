"""SQLAlchemy models for prescription-service (spec §5)."""

from datetime import UTC, datetime

from rxguard_shared.db import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Prescription(Base):
    __tablename__ = "prescriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    items = relationship(
        "PrescriptionItem", back_populates="prescription", cascade="all, delete-orphan"
    )


class PrescriptionItem(Base):
    __tablename__ = "prescription_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    prescription_id: Mapped[int] = mapped_column(
        ForeignKey("prescriptions.id", ondelete="CASCADE"), index=True
    )
    drug_name: Mapped[str] = mapped_column(String(255), nullable=False)
    rxcui: Mapped[str | None] = mapped_column(String(16))
    dosage: Mapped[str | None] = mapped_column(String(64))
    route: Mapped[str | None] = mapped_column(String(32))

    prescription = relationship("Prescription", back_populates="items")
