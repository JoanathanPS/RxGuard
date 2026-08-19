"""Drug catalog access — delegates to the shared loader in rxguard_shared.data.

Kept as a thin module so route code reads cleanly; the actual dataset logic
(and the Phase 2 RxNorm fallback layer) lives in the shared package used by
both prescription-service and interaction-service.
"""

from rxguard_shared.data import search_drugs, standardize

__all__ = ["search_drugs", "standardize"]
