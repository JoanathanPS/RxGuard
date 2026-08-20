"""Seed the admin user for user-service.

Run from the repo root or the service directory:
    python -m app.seed            (from services/user-service)
    python scripts/seed_db.py     (repo-root wrapper)
"""

from rxguard_shared.schemas.enums import Role
from sqlalchemy import select, text

from user_app.core.config import get_settings
from user_app.core.security import hash_password
from user_app.db import SessionLocal
from user_app.models import User


def seed_admin() -> None:
    settings = get_settings()
    with SessionLocal() as db:
        if settings.database_url.startswith("postgresql"):
            db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{settings.schema_name}"'))
            db.commit()
        existing = db.scalar(select(User).where(User.email == settings.admin_email))
        if existing is not None:
            print(f"admin already exists ({settings.admin_email})")
            return
        db.add(
            User(
                email=settings.admin_email,
                name=settings.admin_name,
                password_hash=hash_password(settings.admin_password),
                role=Role.ADMIN.value,
            )
        )
        db.commit()
        print(f"created admin {settings.admin_email}")


if __name__ == "__main__":
    seed_admin()
