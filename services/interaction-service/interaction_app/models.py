"""SQLAlchemy models for interaction-service (spec §5: interaction_results,
benchmark_cases arrives with Phase 4)."""

from datetime import UTC, datetime

from rxguard_shared.db import Base
from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column


class InteractionResult(Base):
    __tablename__ = "interaction_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Logical reference to prescription-service records; no cross-schema FK
    # (each service owns its own schema — spec microservice boundary).
    prescription_id: Mapped[int | None] = mapped_column(Integer, index=True)
    drug_a: Mapped[str] = mapped_column(String(255), nullable=False)
    drug_b: Mapped[str] = mapped_column(String(255), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    mechanism: Mapped[str] = mapped_column(String(500), nullable=False)
    action: Mapped[str | None] = mapped_column(String(500))
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    engine: Mapped[str] = mapped_column(String(16), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    detection_time_ms: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
