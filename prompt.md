# RxGuard — Build Specification for OpenCode

> **RxGuard: An AI-Assisted Drug Interaction Checker for Error-Free Prescription Validation — A Comparative Study Against Manual Reference-Based Verification**
> CSA1016 – Software Engineering Capstone · SIMATS Engineering (Biotechnology)
> Team: Joanathan Packia Singh, Akileshwaran A, Dilli Babu N, Pilli Varshini · Supervisor: Dr. K. Anita Davamani

This file is the single source of truth for building RxGuard. Read it in full before writing any code. It reflects the system architecture, modules, and tech stack from the project's Review 2 presentation, translated into a concrete, phased implementation plan. Build in the phase order given in **Section 9** — don't jump ahead to Kubernetes/monitoring before the core interaction-checking flow actually works end to end.

If you need to deviate from anything below (a library doesn't fit, an API has changed, a phase turns out too big), say so and propose the smallest change that keeps the rest of the spec intact — don't silently drop a module.

---

## 1. What RxGuard does

Medication errors and drug-drug interactions (DDIs) are a major, preventable cause of patient harm, especially for patients on multiple medications (elderly, chronically ill, polypharmacy cases). Today this is checked manually against reference databases/formularies — slow, memory-dependent, and it doesn't scale as drug counts grow.

RxGuard takes a prescription (a patient profile + a list of medications), runs it through an AI-assisted interaction-detection pipeline, and produces a validation report: detected drug-drug interactions, contraindications, duplicate medications, severity-ranked alerts, and a plain-language explanation of *why* each interaction matters and what to do about it.

The distinguishing feature of this capstone (not just "build a checker app") is the **comparative evaluation**: RxGuard runs the same benchmark prescriptions through both an AI-assisted engine and a simulated manual/reference-based engine, and reports accuracy, precision, recall, F1, false-positive rate, false-negative rate, and time-to-check for each — to answer the project's actual research question: *does AI assistance improve efficiency and consistency over manual verification?* Treat the comparative evaluation module as first-class, not an afterthought bolted on at the end.

**Academic/safety disclaimer to bake into the README and the UI footer:** this is a research/educational capstone, not a certified medical device. AI output must be presented as decision *support*, never as a replacement for a qualified clinician or an authoritative reference. Say this explicitly in the app.

---

## 2. Confirmed tech & scope decisions

These were decided up front — don't re-litigate them, just implement:

- **Full architecture as diagrammed** in the Review 2 deck (microservices, API gateway, Docker/Kubernetes, Prometheus/Grafana/ELK, RBAC) — not a simplified monolith. Because this is a lot of surface area for one build, it's sequenced into phases (Section 9); early phases deliberately run the "microservices" as separate FastAPI apps in Docker Compose before Kubernetes enters the picture.
- **Drug/interaction data:** free public sources — **RxNorm API** (drug standardization, autocomplete) and **OpenFDA** (drug label / interaction / adverse-event data) — no API key required for either. Since public API coverage of DDI pairs is inconsistent and a live demo/grading session can't depend on network flakiness, back both with a **local curated dataset** (`data/interactions_seed.csv` or `.json`) of well-known interactions (seed it with the deck's own examples: Warfarin+Aspirin → high-severity bleeding risk, Amoxicillin+Paracetamol → safe/no significant interaction, and ~15-20 more well-documented pairs spanning severity levels). The local dataset also doubles as: (a) the fallback when RxNorm/OpenFDA are unreachable, (b) the ground truth for the benchmark/comparative-evaluation suite, and (c) the entire data source for the Manual-Simulated Checking Engine (see Module 2).
- **AI provider: Groq API** (fast LLM inference, OpenAI-compatible SDK/endpoint) — used for the explanation generator and to assist severity reasoning. Requires the user's own `GROQ_API_KEY`; make the model configurable via `GROQ_MODEL` env var (default to a current Groq-hosted Llama model — check Groq's model list at build time since hosted models rotate, `llama-3.3-70b-versatile` was current as of this spec).
- **Mobile app is out of scope** — it's explicitly listed as Future Scope in the deck itself (slide 13). Build the web app only; keep the API layer clean enough that a mobile client could consume it later.

---

## 3. System architecture

```
                         CLIENTS
                    Web Application (React)
                              │
                              ▼
                        API GATEWAY
                (routing, TLS, rate limiting)
                              │
        ┌───────┬───────┬────┴────┬────────┬──────────┬────────┐
        ▼       ▼       ▼         ▼        ▼          ▼        ▼
     User   Patient  Prescr.  Interaction  Alert   Analytics  Audit
    Service Service  Service   Service    Service   Service  Service
        │       │       │         │          │          │        │
        └───────┴───────┴────┬────┴──────────┴──────────┴────────┘
                              ▼
                       DATA STORAGE LAYER
        Operational DB (PostgreSQL) · Interaction Cache (Redis)
        Audit Log DB (append-only) · Analytics Warehouse (PostgreSQL)
                              │
                              ▼
                  EXTERNAL DATA & SERVICES
      RxNorm API · OpenFDA · Groq LLM API · local seed dataset

  CROSS-CUTTING: AuthN/AuthZ (JWT+RBAC) · Audit & compliance logging ·
  Prometheus/Grafana + ELK monitoring · rate limiting · error handling

  DEVOPS: GitHub → GitHub Actions CI/CD → GHCR → Docker Compose (dev) /
  Kubernetes (deploy) → backup & DR scripts
```

**Users/roles:** Clinician/Prescriber, Pharmacist, Researcher/Analyst, Admin — enforced via RBAC (see Section 7).

**Services (one FastAPI app each, own DB schema, own Dockerfile):**

| Service | Responsibility |
|---|---|
| `user-service` | Registration/login, JWT issuance, role management |
| `patient-service` | Patient profiles (age, gender, medical history) |
| `prescription-service` | Prescription + medication entry, drug search/autocomplete proxy, prescription history |
| `interaction-service` | The core engine: drug standardization, N-ary interaction checking, severity classification, the Manual-Simulated engine, the benchmark/test-case runner |
| `alert-service` | Severity-tiered alerts, explanation generation (Groq), alert prioritization, override/acknowledge workflow |
| `analytics-service` | Metrics calculation (accuracy/precision/recall/F1/FPR/FNR/time), comparative dashboard data |
| `audit-service` | Immutable audit log of every alert, override, edit, and access to sensitive data |

---

## 4. Functional modules (map 1:1 to the presentation's 4 modules)

### Module 1 — Prescription Entry & Validation
*Services: `prescription-service`, `patient-service`*

- Patient profile management: age, gender, medical history (structured, e.g. list of known conditions/allergies).
- Medication entry: drug name, dosage, route; supports adding multiple drugs to one prescription (this is what makes N-ary checking meaningful).
- Drug search & autocomplete backed by RxNorm, with local-dataset fallback.
- Input validation & normalization (dosage units, route enums, duplicate-drug detection before it even reaches the interaction engine).
- Drug standardization: map every entered drug to an RxNorm concept ID (RXCUI) before interaction checking.
- Prescription history & audit logging (every prescription creation/edit is logged via `audit-service`).

### Module 2 — Drug Interaction Detection & Severity Analysis (the core engine)
*Service: `interaction-service`*

This module must implement **two parallel checking engines** so the comparative study in Module 4 has something to compare:

1. **System (AI-assisted) Checking Engine** — the real product:
   - Pairwise *and* full N-ary interaction generation across all drugs in a prescription (not just adjacent pairs — check every combination).
   - Rule-based matching engine against the local seed dataset + live OpenFDA/RxNorm lookups.
   - A lightweight **trained ML classifier** (scikit-learn — e.g. gradient boosting or logistic regression over engineered features: drug class flags, known-mechanism flags, patient risk factors) that assists severity prediction on cases the rule table doesn't cover exactly. Train it on the benchmark/seed dataset. This is what makes "AI/ML Model" in the deck's tech list genuinely true, rather than just an LLM call — and keeping the classifier separate from the LLM keeps the actual severity *decision* auditable/explainable (the LLM's job is narrower: turn a decision into a clear explanation, not make the decision silently). Call this design choice out in `docs/architecture.md` — it's a legitimate innovation angle for the report/viva ("why not just ask an LLM for severity" → determinism, auditability, and safety).
   - Severity classification: **Critical / High / Moderate / Low / Safe**.
   - Output includes confidence and which source flagged it (local dataset / OpenFDA / ML classifier).

2. **Manual-Simulated Checking Engine** — a deliberately "manual-like" baseline for comparison:
   - Looks up interactions **only** via direct pairwise lookups against the static local reference dataset (no ML, no LLM, no fuzzy/partial matching, no live API).
   - Does not reason about N-ary combinations beyond explicit pairs in the table — this intentionally mirrors the deck's own Problem Statement claim that manual/reference-based checking "doesn't scale with more drugs" and can miss multi-drug risk.
   - Simulate realistic manual lookup latency (e.g. a small artificial delay per pair-lookup, documented and configurable) so the time-to-check comparison in Module 4 is meaningful rather than trivially "0ms vs 200ms because one path just didn't do real work."

- A **Test Case Runner**: runs a fixed set of benchmark prescriptions (with hand-labeled ground truth) through both engines on demand — this is what feeds Module 4's metrics.

### Module 3 — Clinical Decision Support & Alert Management
*Service: `alert-service`*

- AI explanation generator: given a detected interaction, call Groq to produce a plain-language explanation covering mechanism (why the interaction happens) and recommended action (e.g. monitor, avoid, adjust dosage — phrased as "discuss with prescriber," never a direct clinical order).
- Severity-based alerts (Critical/High/Moderate/Low), rendered distinctly in the UI (color + iconography, not just text).
- Alert prioritization / alert-fatigue reduction: when a prescription has many low-severity alerts, group/collapse them and surface Critical/High first.
- Override & acknowledge workflow: a clinician can acknowledge or override an alert, but must supply a justification, which is logged.
- All of the above writes to the audit trail via `audit-service`.

### Module 4 — Comparative Evaluation & System Monitoring
*Services: `analytics-service`, plus DevOps/monitoring stack*

- Metrics calculator: for each benchmark run, compute accuracy, precision, recall, F1, false-positive rate, false-negative rate, and time-to-check, **separately for the AI-assisted engine and the Manual-Simulated engine**, against the labeled ground truth.
- Analytics dashboard: charts comparing AI vs Manual across all of the above metrics, plus history of past evaluation runs (so results can be shown improving/changing over the project timeline — useful for the review report).
- System monitoring: Prometheus + Grafana for service health/latency/throughput, ELK for centralized structured logs (see Section 8).

---

## 5. Data model (high-level — refine per service as you build)

- **user-service**: `users(id, name, email, password_hash, role, created_at)`
- **patient-service**: `patients(id, name, age, gender, medical_history JSONB, created_by, created_at)`
- **prescription-service**: `prescriptions(id, patient_id, clinician_id, status, created_at)`, `prescription_items(id, prescription_id, drug_name, rxcui, dosage, route)`
- **interaction-service**: `interaction_results(id, prescription_id, drug_a, drug_b, severity, mechanism, source[local|openfda|ml|manual], engine[ai|manual], confidence, detection_time_ms, created_at)`, `benchmark_cases(id, description, drug_list JSONB, expected_results JSONB)`
- **alert-service**: `alerts(id, prescription_id, interaction_result_id, severity, message, explanation, status[open|acknowledged|overridden], acted_by, justification, created_at)`
- **analytics-service**: `evaluation_runs(id, engine[ai|manual], accuracy, precision, recall, f1, fpr, fnr, avg_time_ms, created_at)`
- **audit-service**: `audit_log(id, actor_id, action, entity_type, entity_id, before JSONB, after JSONB, created_at)` — enforce append-only at the DB permission level (no UPDATE/DELETE grants on this table for the app role).

---

## 6. Representative API surface

Don't treat this as exhaustive — flesh out CRUD as needed — but match these shapes so the frontend and the phases below line up:

- `user-service`: `POST /auth/register`, `POST /auth/login` → JWT, `GET /users/me`, `GET /users` (admin)
- `patient-service`: `GET/POST /patients`, `GET/PUT /patients/{id}`
- `prescription-service`: `POST /prescriptions`, `GET /prescriptions/{id}`, `GET /patients/{id}/prescriptions`, `GET /drugs/search?q=`
- `interaction-service`: `POST /interactions/check` (AI engine), `POST /interactions/check-manual` (manual-simulated engine), `POST /interactions/compare` (run both + diff), `POST /benchmark/run`, `GET /benchmark/cases`
- `alert-service`: `GET /alerts?prescription_id=`, `POST /alerts/{id}/acknowledge`, `POST /alerts/{id}/override`
- `analytics-service`: `GET /analytics/runs`, `GET /analytics/summary`
- `audit-service`: `GET /audit?entity_id=` (Admin/Researcher only)

---

## 7. Cross-cutting concerns

- **AuthN/AuthZ:** JWT-based auth (`python-jose` + `passlib`), issued by `user-service`, validated by every other service/gateway. This is the practical substitute for the deck's "OAuth2/SSO" box — document that substitution explicitly in `docs/architecture.md`.
- **RBAC:** four roles — Clinician/Prescriber, Pharmacist, Researcher/Analyst, Admin. Gate endpoints accordingly (e.g. only Admin/Researcher can read `audit-service`; only Clinician/Pharmacist can acknowledge/override alerts).
- **Audit & compliance:** every alert, override, prescription edit, and sensitive read is logged. Frame this in docs as "designed with WHO/GDPR/HIPAA audit-logging principles in mind for an academic project" — do **not** claim actual regulatory certification/compliance anywhere in the app or docs.
- **Rate limiting & error handling:** basic rate limiting at the gateway (e.g. `slowapi` per-service or gateway-level), consistent error response schema across all services.

---

## 8. DevOps & monitoring

- **Repo/CI:** GitHub, with GitHub Actions running lint + tests on every push, then build + push images to GHCR on merge to main.
- **Local dev:** `docker-compose.yml` bringing up every service + Postgres + Redis + the frontend with one command.
- **Deployment:** Kubernetes manifests under `infra/k8s/` (Deployments, Services, ConfigMaps, Secrets, Ingress) — target a local cluster (kind/minikube) for demo purposes; document exact `kubectl apply` steps in the README so it's reproducible for grading/demo without a real cloud bill.
- **Monitoring:** Prometheus scraping `/metrics` from each FastAPI service (`prometheus-fastapi-instrumentator`), Grafana dashboards for latency/throughput/error rate, and an ELK stack (Elasticsearch + Filebeat/Logstash + Kibana) for centralized structured JSON logs — all as an optional `docker-compose.monitoring.yml` overlay so the core app can run and be graded without requiring the heavier monitoring stack to be up.
- **Backup/DR:** a documented `pg_dump`-based backup script is sufficient for this project's scale — real disaster-recovery infra is out of scope, but the script and a short runbook should exist.

---

## 9. Build order (phased — follow this sequence)

Building all seven services, the full comparative-evaluation logic, and the full DevOps stack simultaneously is how these builds stall. Go in this order, and get each phase actually running before moving to the next:

1. **Phase 0 — Scaffolding.** Monorepo structure (see Section 10), shared Pydantic schemas, `.env.example`, `docker-compose.yml` skeleton (Postgres + Redis only), CI skeleton (lint + empty test job).
2. **Phase 1 — Core vertical slice.** `user-service` (auth/JWT/RBAC), `patient-service`, `prescription-service`, `interaction-service` (rule-based + local dataset only, no ML/LLM yet), and a minimal React frontend (login, patient create, prescription entry, results view). Goal: a prescription can be entered and get a rule-based interaction result end to end.
3. **Phase 2 — AI integration.** Wire the Groq explanation generator into `alert-service`; add the scikit-learn severity classifier to `interaction-service`; add live RxNorm/OpenFDA calls with local-dataset fallback.
4. **Phase 3 — Alerts & audit.** Full `alert-service` (prioritization, override/acknowledge + justification), `audit-service` (append-only log), RBAC enforced everywhere.
5. **Phase 4 — Comparative evaluation.** Manual-Simulated engine, benchmark dataset + Test Case Runner, `analytics-service` metrics calculator, dashboard with AI-vs-Manual charts. This is the module the project's actual thesis depends on — don't shortcut it.
6. **Phase 5 — Gateway & service wiring.** Put an API gateway (Traefik is a reasonable choice for Docker Compose → Kubernetes portability) in front of everything; finalize inter-service auth.
7. **Phase 6 — DevOps & monitoring.** Kubernetes manifests, GitHub Actions build/push/deploy, Prometheus + Grafana + ELK overlay, rate limiting, backup script.
8. **Phase 7 — Polish & report artifacts.** `docs/architecture.md` (as-built, with any deviations from this spec called out), OpenAPI docs per service, seed/demo data, exported charts/screenshots suitable for dropping into the capstone review report and viva.

Commit at the end of each phase with a message naming the phase, so progress is easy to review.

---

## 10. Suggested repo structure

```
rxguard/
  services/
    api-gateway/
    user-service/
    patient-service/
    prescription-service/
    interaction-service/
    alert-service/
    analytics-service/
    audit-service/
  frontend/                 # React + TypeScript
  shared/                   # shared Pydantic schemas / common libs
  data/
    interactions_seed.csv
    benchmark_cases.json
  infra/
    docker-compose.yml
    docker-compose.monitoring.yml
    k8s/
    monitoring/
      prometheus.yml
      grafana/
  .github/workflows/
  docs/
    architecture.md
    evaluation-methodology.md
  scripts/
    seed_db.py
    benchmark_runner.py
    backup.sh
  .env.example
  README.md
```

---

## 11. Tech stack summary

- **Frontend:** React + TypeScript, Vite, TanStack Query, Recharts for the analytics dashboard, Tailwind CSS.
- **Backend:** Python 3.11+, FastAPI per service, Pydantic v2, SQLAlchemy + Alembic migrations.
- **AI/ML:** Groq API (LLM, via `groq` Python SDK or OpenAI-compatible client) for explanations; scikit-learn for the severity classifier.
- **Data:** PostgreSQL (operational + analytics), Redis (interaction cache).
- **Auth:** JWT (`python-jose`), `passlib[bcrypt]`.
- **Gateway/infra:** Traefik (or comparable), Docker, Docker Compose, Kubernetes.
- **CI/CD:** GitHub Actions, GHCR.
- **Monitoring:** Prometheus, Grafana, ELK stack.
- **Testing:** `pytest` per service, `Vitest` + React Testing Library for frontend.

---

## 12. Environment variables (`.env.example`)

```
# AI
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile

# External data (no key required)
RXNORM_BASE_URL=https://rxnav.nlm.nih.gov/REST
OPENFDA_BASE_URL=https://api.fda.gov

# Data stores
DATABASE_URL=postgresql://rxguard:rxguard@postgres:5432/rxguard
REDIS_URL=redis://redis:6379/0

# Auth
JWT_SECRET=change-me
JWT_EXPIRY_MINUTES=60
```

---

## 13. Deliverables checklist (for the capstone review)

- [ ] All 7 services running via `docker-compose up`, plus frontend.
- [ ] End-to-end demo: create patient → enter prescription with 3+ drugs → see AI-assisted interaction results with severity + explanations.
- [ ] Manual-Simulated engine runnable side by side on the same prescription.
- [ ] Benchmark suite + comparative evaluation dashboard showing accuracy/precision/recall/F1/FPR/FNR/time for AI vs Manual.
- [ ] Override/acknowledge workflow with justification, visible in audit log.
- [ ] `docs/architecture.md` describing the as-built system and any deviations from this spec (especially the OAuth2→JWT and ClickHouse→PostgreSQL substitutions).
- [ ] Kubernetes manifests that `kubectl apply` cleanly on a local cluster.
- [ ] CI pipeline green on GitHub Actions.
- [ ] Grafana dashboard showing live service metrics; Kibana showing centralized logs.
- [ ] README with full setup/run/seed/test instructions and the "not for clinical use" disclaimer.

---

## 14. Working notes for OpenCode

- Comment code generously and explain non-obvious design decisions inline or in `docs/architecture.md` — this is a student project that will be defended in a viva, so the team needs to be able to explain every part of it, not just run it.
- Where you make a call that trades deck-fidelity for buildability (e.g. Traefik instead of a bespoke gateway, PostgreSQL instead of ClickHouse for the analytics warehouse), state it plainly in `docs/architecture.md` under a "Deviations from the original design" heading — for a software engineering capstone, being able to justify architectural trade-offs is itself part of the grade.
- Keep the Manual-Simulated engine genuinely separate in code from the AI engine (don't let it secretly reuse the ML classifier) — the comparative study only means something if the two paths are actually independent.
- After Phase 1 and after Phase 4, pause and produce a short status summary of what's working and what isn't, before continuing — these are the two points where the core value of the project (a working checker, then real comparative numbers) becomes verifiable.
