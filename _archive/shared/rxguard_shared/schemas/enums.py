"""Domain enums shared across all RxGuard services.

Keeping these in one place guarantees the frontend, gateway, and every
service agree on role names, severity levels, and engine identifiers —
this is what makes the comparative evaluation (AI vs Manual engine) and
the RBAC model consistent end to end.
"""

from enum import StrEnum


class Role(StrEnum):
    """RBAC roles from the Review 2 deck (Section 7 of the spec)."""

    CLINICIAN = "clinician"
    PHARMACIST = "pharmacist"
    RESEARCHER = "researcher"
    ADMIN = "admin"


class Severity(StrEnum):
    """Interaction severity levels (Module 2 of the spec)."""

    CRITICAL = "critical"
    HIGH = "high"
    MODERATE = "moderate"
    LOW = "low"
    SAFE = "safe"


class Engine(StrEnum):
    """Which checking engine produced a result (used by Module 4 comparison)."""

    AI = "ai"
    MANUAL = "manual"


class Source(StrEnum):
    """Where an interaction/signal was flagged from (spec Section 4, Module 2)."""

    LOCAL = "local"
    OPENFDA = "openfda"
    ML = "ml"
    MANUAL = "manual"


class AlertStatus(StrEnum):
    """Lifecycle of an alert (spec Section 5, alert-service)."""

    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    OVERRIDDEN = "overridden"


# Roles allowed to acknowledge/override alerts (spec Section 7).
ALERT_ACTION_ROLES = frozenset({Role.CLINICIAN, Role.PHARMACIST})

# Roles allowed to read the audit log (spec Section 7).
AUDIT_READ_ROLES = frozenset({Role.ADMIN, Role.RESEARCHER})
