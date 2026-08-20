"""SQLAlchemy models for user-service (spec §5: users table)."""

from datetime import UTC, datetime

from rxguard_shared.db import Base
from rxguard_shared.schemas.enums import Role
from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # Stored as a string for portability (SQLite in tests); validated via Role enum.
    role: Mapped[str] = mapped_column(String(32), nullable=False, default=Role.CLINICIAN.value)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
