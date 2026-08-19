# RxGuard

**An AI-assisted drug interaction checker for error-free prescription validation —
a comparative study against manual reference-based verification.**

CSA1016 Software Engineering Capstone · SIMATS Engineering (Biotechnology)
Team: Joanathan Packia Singh, Akileshwaran A, Dilli Babu N, Pilli Varshini ·
Supervisor: Dr. K. Anita Davamani

> ⚠️ **Disclaimer**: RxGuard is a **research/educational capstone project**, not a
> certified medical device. Its output is decision **support** only and must never
> replace a qualified clinician or an authoritative reference. Do not use it for
> actual patient care.

## What it is

RxGuard takes a prescription (a patient profile + a list of medications), runs it
through an AI-assisted interaction-detection pipeline, and produces a validation
report: drug-drug interactions, contraindications, duplicate medications,
severity-ranked alerts, and plain-language explanations.

The distinguishing feature is a **comparative evaluation**: the same benchmark
prescriptions run through both an AI-assisted engine and a simulated
manual/reference-based engine, scored on accuracy, precision, recall, F1,
false-positive rate, false-negative rate, and time-to-check — answering the
research question: *does AI assistance improve efficiency and consistency over
manual verification?*

The full build specification is in [`prompt.md`](./prompt.md) (single source of
truth). Architecture decisions and deviations are tracked in
[`docs/architecture.md`](./docs/architecture.md).

## Repository layout

```
services/           7 FastAPI microservices (+ api-gateway placeholder)
  user-service      registration, login, JWT, roles
  patient-service   patient profiles
  prescription-service  prescriptions, medication entry, drug search
  interaction-service   core engine (rule/ML/manual engines, benchmark runner)
  alert-service     alerts, explanations (Groq), prioritization, override/ack
  analytics-service comparative metrics + dashboard data
  audit-service     immutable audit log
shared/             rxguard_shared: enums, schemas, JWT, JSON logging
frontend/           React + TypeScript web app (Phase 1)
data/               interactions_seed.csv, drug_mapping.csv,
                    drug_patient_risk_rules.csv, benchmark cases
                    (see prompt-patient-profile-addendum.md for the
                    patient-context safety module folded into Phases 1-3)
infra/              docker-compose (+ monitoring overlay), k8s manifests
docs/               architecture + evaluation methodology
scripts/            bootstrap, dev runner, seeding, backup
.github/workflows/  CI
```

## Current status

**Phase 0 — Scaffolding (complete).** Repo skeleton, shared package, 7 service
templates (each with `/health` + `/metrics`), seed data, compose data-layer
skeleton, CI. **Phase 1 — Core vertical slice (next).**

## Quickstart (Phase 0)

Prerequisites: Python 3.11+, Docker with Docker Compose, Node 20+ (frontend, from
Phase 1).

```powershell
# 1. Environment
Copy-Item .env.example .env        # then edit secrets
.\scripts\bootstrap.ps1            # create .venv, install shared + services

# 2. Data layer (Docker Desktop must be running)
docker compose -f infra/docker-compose.yml up -d postgres redis
docker compose -f infra/docker-compose.yml ps   # both healthy

# 3. Run a service locally
.\scripts\run-dev.ps1 user-service               # http://localhost:8001/docs
```

Or run the whole stack with `docker compose -f infra/docker-compose.yml up`
(services are added to this file from Phase 1 onward).

## Verification

```powershell
.\.venv\Scripts\python.exe -m ruff check shared services
.\.venv\Scripts\python.exe -m pytest shared services
```

CI runs the same two commands on every push (`.github/workflows/ci.yml`).

## Roadmap

1. **P1** Core vertical slice: auth, patients, prescriptions, rule-based
   interaction checking, minimal React UI.
2. **P2** AI: Groq explanations, scikit-learn severity classifier, live
   RxNorm/OpenFDA with local fallback.
3. **P3** Alerts & audit: prioritization, override/acknowledge, append-only log,
   full RBAC.
4. **P4** Comparative evaluation: manual-simulated engine, benchmark suite,
   metrics dashboard (the project's thesis).
5. **P5** Traefik API gateway.
6. **P6** Kubernetes, CI/CD to GHCR, Prometheus/Grafana/ELK.
7. **P7** Docs, OpenAPI, demo data, report artifacts.

See `prompt.md` §9 for the authoritative build order.