"""Database session wiring for interaction-service."""

from collections.abc import Generator

from rxguard_shared.db import (  # noqa: F401  (Base re-exported for alembic)
    Base,
    get_db,
    make_session_factory,
)
from sqlalchemy.orm import Session

from interaction_app.core.config import get_settings

settings = get_settings()
SessionLocal = make_session_factory(settings.database_url, schema=settings.schema_name)


def db_session() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a request-scoped session."""
    yield from get_db(SessionLocal)
