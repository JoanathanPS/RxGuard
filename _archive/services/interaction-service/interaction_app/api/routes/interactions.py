"""Interaction check routes (spec §6).

- POST /interactions/check          — AI-assisted engine (rule-based in Phase 1)
- POST /interactions/check-manual   — Manual-Simulated engine (Phase 4)
- POST /interactions/compare        — run both + diff (Phase 4)
"""

from fastapi import APIRouter, HTTPException, status
from rxguard_shared.schemas.enums import Engine
from sqlalchemy.orm import Session

from interaction_app.api.deps import DbDep, PrincipalDep
from interaction_app.engines import run_ai_engine
from interaction_app.models import InteractionResult
from interaction_app.schemas import (
    CheckRequest,
    CheckResponse,
    InteractionResultOut,
)

router = APIRouter()


def _persist(
    db: Session,
    request: CheckRequest,
    engine: Engine,
    results: list[dict],
    detection_time_ms: float,
) -> None:
    rows = [
        InteractionResult(
            prescription_id=request.prescription_id,
            drug_a=r["drug_a"],
            drug_b=r["drug_b"],
            severity=r["severity"],
            mechanism=r["mechanism"],
            action=r.get("action"),
            source=r["source"],
            engine=engine.value,
            confidence=r["confidence"],
            detection_time_ms=detection_time_ms,
        )
        for r in results
    ]
    db.add_all(rows)
    db.commit()


def _to_out(results: list[dict]) -> list[InteractionResultOut]:
    return [InteractionResultOut(**r) for r in results]


@router.post("/check", response_model=CheckResponse)
def check_interactions(
    payload: CheckRequest, db: DbDep = None, _: PrincipalDep = None
) -> CheckResponse:
    results, elapsed_ms = run_ai_engine([d.drug_name for d in payload.drugs])
    _persist(db, payload, Engine.AI, results, elapsed_ms)
    return CheckResponse(
        prescription_id=payload.prescription_id,
        patient_id=payload.patient_id,
        engine=Engine.AI,
        drug_count=len(payload.drugs),
        pairs_checked=len(results),
        detection_time_ms=round(elapsed_ms, 2),
        results=_to_out(results),
    )


@router.post("/check-manual", response_model=CheckResponse)
def check_interactions_manual(
    payload: CheckRequest, _: PrincipalDep = None
) -> CheckResponse:
    # Implemented in Phase 4 (Comparative Evaluation).
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Manual-Simulated engine arrives in Phase 4",
    )
