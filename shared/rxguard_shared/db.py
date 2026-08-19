"""Shared SQLAlchemy plumbing.

Each RxGuard service owns its own Postgres **schema** (spec: "own DB schema").
The engine URL is built with `options=-csearch_path%3D<schema>` so every
`create_table`/query the service issues lands in its schema without qualifying
every table name. When a non-Postgres URL is used (e.g. SQLite in tests) the
search-path option is skipped, keeping unit tests dependency-free.
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Declarative base every service model inherits from."""


def build_engine_url(database_url: str, schema: str | None) -> str:
    """Append the Postgres search_path option when relevant."""
    if schema and database_url.startswith("postgresql"):
        sep = "&" if "?" in database_url else "?"
        return f"{database_url}{sep}options=-csearch_path%3D{schema}"
    return database_url


def make_session_factory(
    database_url: str, schema: str | None = None
) -> sessionmaker[Session]:
    engine = create_engine(build_engine_url(database_url, schema), pool_pre_ping=True)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db(session_factory: sessionmaker[Session]) -> Generator[Session, None, None]:
    """FastAPI dependency factory — returns a fresh session per request."""
    db = session_factory()
    try:
        yield db
    finally:
        db.close()
