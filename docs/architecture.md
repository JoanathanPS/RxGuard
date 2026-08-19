# RxGuard Architecture

> As-built architecture and design-justification ledger for the RxGuard capstone.
> This document is a living record: it is updated at the end of every phase and
> explicitly calls out deviations from the original Review 2 design, because
> being able to justify architectural trade-offs is part of the grading criteria.

## Project

- **RxGuard**: AI-assisted drug interaction checker with a comparative evaluation
  against a simulated manual/reference-based engine.
- **Course**: CSA1016 Software Engineering Capstone — SIMATS Engineering (Biotechnology).
- **Team**: Joanathan Packia Singh, Akileshwaran A, Dilli Babu N, Pilli Varshini.
- **Supervisor**: Dr. K. Anita Davamani.
- **Source of truth**: `prompt.md` (Review 2 build specification).
- **Research question**: does AI assistance improve efficiency and consistency of
  drug-interaction checking over manual verification?

> **Important disclaimer**: this is a research/educational capstone project, not a
> certified medical device. Output is decision *support* only and must never
> replace a qualified clinician or an authoritative reference.

## Status

| Phase | State |
|---|---|
| 0 — Scaffolding | ✅ done (see below) |
| 1 — Core vertical slice | ⏳ next |
| 2 — AI integration | — |
| 3 — Alerts & audit | — |
| 4 — Comparative evaluation | — |
| 5 — Gateway & service wiring | — |
| 6 — DevOps & monitoring | — |
| 7 — Polish & report artifacts | — |

## Phase 0 — as-built

- Monorepo scaffold: `services/` (7 FastAPI apps + placeholder for the gateway),
  `shared/rxguard_shared` package, `data/` seed datasets, `infra/` compose files,
  `.github/workflows/ci.yml`, `docs/`.
- Each service is a template FastAPI app exposing `/health` (standard envelope)
  and a `/metrics` placeholder; has its own `pyproject.toml` (ruff + pytest), a
  repo-root-context Dockerfile, and an Alembic scaffold (no migrations yet).
- `shared/rxguard_shared` holds the domain enums (`Role`, `Severity`, `Engine`,
  `Source`, `AlertStatus`), the standard error/health envelopes, JWT helpers, and
  stdout JSON logging (structured for later ELK ingestion).
- `data/interactions_seed.csv` (24 well-known pairs across all severities),
  `data/drug_mapping.csv` (drug → RXCUI → class → ML feature flags), and
  `data/drug_patient_risk_rules.csv` (patient-context safety rules, see below)
  are in place; they double as the rule-engine source, the live-API fallback, and
  the ground truth for the Phase 4 benchmark.
- `infra/docker-compose.yml` currently brings up only Postgres + Redis; services
  are added per phase.

## Addendum: Patient Profile Intake & Drug-Patient Safety module

`prompt-patient-profile-addendum.md` adds a supervisor-required capability: judge
whether each prescribed drug is safe for *this patient* (labs, conditions,
allergies, pregnancy, age), not just whether drugs clash with each other. Folded
into the existing phases, per the addendum's own instruction:

- **Phase 1** — structured patient intake replaces the single `medical_history
  JSONB` catch-all: `patients` gains weight/height/pregnancy fields plus
  `patient_conditions`, `patient_allergies`, `patient_labs`,
  `patient_lifestyle` tables; adaptive (rules-driven) intake wizard in the
  frontend with "not available" options for every field.
- **Phase 2** — the Patient-Context Risk Engine (a module in `interaction-service`,
  architecturally separate from the DDI engine, own `patient_risk_results`
  table) evaluates renal/hepatic/age/pregnancy/allergy/condition suitability per
  drug using `data/drug_patient_risk_rules.csv` (seeded, ~19 rules), emitting a
  verdict (`Safe` / `Caution` / `Avoid`) + the triggering patient factor, and
  stating explicitly when data is missing rather than assuming normal.
- **Phase 3** — DDI alerts and patient-risk verdicts merge into the **same**
  alert pipeline so the clinician sees one severity-sorted list (tagged
  "drug-drug" vs "drug-patient"), with side-effect summaries per drug grounded in
  the same LLM-explains/rule-decides pattern as the DDI explanations.

Reference repos in the addendum (pillchecker-api, awesome-drug-interactions,
drug-interaction-checker, LangGraph CDS, HealthRex/CDSS) are studied for
**patterns only** — no dependency is pulled into RxGuard, which stays
self-contained. Borrowed patterns, if any, are cited here as they land.

## Deviations from the original design

Recorded here with rationale, per spec §14. New entries are added each phase.

1. **OAuth2/SSO → JWT (python-jose + passlib).** The deck's "OAuth2/SSO" box is
   implemented as a practical JWT-based token scheme issued by `user-service` and
   validated by every other service. Justification: full OAuth2/SSO infrastructure
   is disproportionate for a capstone, while JWT+RBAC preserves the same auth
   semantics and is simpler to defend in the viva.
2. **ClickHouse → PostgreSQL for the analytics warehouse.** The deck mentioned
   ClickHouse; PostgreSQL is already in the stack for operational data, so reusing
   it for the (small) analytics tables avoids a second datastore with no real
   benefit at this scale.
3. **`rxguard-shared` is installed as a separate editable package** rather than
   declared as a dependency in each service's `pyproject.toml`. Keeps path
   handling identical across Windows host dev and Docker builds.
4. **RXCUI values in `data/drug_mapping.csv`** are from memory/community sources
   and must be verified against the live RxNorm API during Phase 2 before being
   treated as authoritative for the demo.

## Design decisions worth defending

- **Single root `.venv` for host dev** (see `scripts/bootstrap.ps1`). Each service
  still ships its own Dockerfile and pyproject; the root venv only speeds up local
  iteration. The graded artifact is the Docker Compose / Kubernetes stack.
- **Structured JSON logging to stdout** from Phase 0 so the Phase 6 ELK overlay
  needs no application changes.

## Cross-cutting concerns

- AuthN/AuthZ: JWT + RBAC (roles: clinician, pharmacist, researcher, admin).
- Audit & compliance: append-only audit log (no UPDATE/DELETE grants), framed as
  "designed with WHO/GDPR/HIPAA principles in mind" — no certification claims.
- Error handling: uniform `{"error": {...}}` envelope via `rxguard_shared`.