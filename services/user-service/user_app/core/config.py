"""Service settings loaded from environment variables / `.env`.

`env_file` covers both running from the service directory and from the repo
root (bootstrap scripts), so `uvicorn app.main:app` works in either place.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    service_name: str = "user-service"
    schema_name: str = "user_svc"
    debug: bool = False

    database_url: str = "postgresql://rxguard:rxguard@localhost:5432/rxguard"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "change-me-to-a-long-random-string"
    jwt_expiry_minutes: int = 60

    # Seed admin user (scripts/seed_db.py and app/seed.py)
    admin_email: str = "admin@rxguard.dev"
    admin_password: str = "admin12345"
    admin_name: str = "RxGuard Admin"

    model_config = {
        "env_file": (".env", "../../.env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
