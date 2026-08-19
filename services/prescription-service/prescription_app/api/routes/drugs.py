"""Drug search routes (spec §6: GET /drugs/search?q=).

Phase 1 resolves against the local catalog; Phase 2 adds RxNorm with the local
catalog as fallback.
"""

from fastapi import APIRouter, Query

from prescription_app.api.deps import PrincipalDep
from prescription_app.core.drug_catalog import search_drugs
from prescription_app.schemas import DrugSearchResult

router = APIRouter()


@router.get("/search", response_model=list[DrugSearchResult])
def drug_search(
    q: str = Query(min_length=1, max_length=100),
    _: PrincipalDep = None,
) -> list[DrugSearchResult]:
    return [
        DrugSearchResult(name=row["drug_name"], rxcui=row["rxcui"], drug_class=row["drug_class"])
        for row in search_drugs(q)
    ]
