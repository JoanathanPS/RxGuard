"""Re-exported auth + DB dependencies for patient-service."""

from typing import Annotated

from fastapi import Depends
from rxguard_shared.auth.principal import (
    Principal,
    PrincipalDep,
    get_principal,
    require_principal_role,
)
from sqlalchemy.orm import Session

from patient_app.db import db_session

DbDep = Annotated[Session, Depends(db_session)]

__all__ = [
    "DbDep",
    "Principal",
    "PrincipalDep",
    "get_principal",
    "require_principal_role",
]
