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
report: drug-drug interactions, patient-context contraindications
(pregnancy / renal impairment / allergies / age…), severity-ranked alerts, and
plain-language explanations.

The distinguishing feature is a **comparative evaluation**: the same benchmark
prescriptions run through both an AI-assisted engine and a deterministic
manual/reference-based engine, scored on accuracy, precision, recall, F1,
false-positive rate, false-negative rate, and time-to-check — answering the
research question: *does AI assistance improve efficiency and consistency over
manual verification?*

The full build specification is in [`prompt.md`](./prompt.md) (single source of
truth). Architecture decisions and deviations are tracked in
[`docs/architecture.md`](./docs/architecture.md). The build plan is
[`plan.md`](./plan.md).

## Repository layout

```
web/                Next.js 16 (App Router) + TypeScript + Tailwind v4 app
  app/              routes: /login /patients /prescriptions/[id] /eval, /api/eval
  components/       interview card, assessment view, eval dashboard, shell
  lib/engines/      manual baseline engine + classification metrics
  lib/supabase/     browser + server + admin (service-role) clients
supabase/
  migrations/       schema + seed + benchmark (applied to cloud project)
  functions/        Edge Functions (Deno): interview-turn, final-assessment, shared
  scripts/          apply-sql.ps1, csv-to-seed.ps1, interview-sim.mjs,
                    eval-ai-loop.mjs
data/               interactions_seed.csv, drug_mapping.csv,
                    drug_patient_risk_rules.csv (source of truth for rules)
docs/               architecture + evaluation methodology
_archive/           original 7-service microservice stack (superseded)
start-rxguard.bat   one-click Windows launcher
```

## Current status

Managed **Supabase** (Postgres + Auth + RLS + Edge Functions) + **Next.js** frontend
+ **Groq** (GPT-OSS-120b) for the LLM flows. The original self-hosted
microservice stack was **archived to `_archive/`** — see the pivot section in
`docs/architecture.md` for the justification.

- **Phase 0/1** ✅ — cloud schema + seed applied; auth/patients/prescriptions
  with RLS.
- **Phase 2** ✅ — adaptive LLM-led interview (`interview-turn`), canonical
  question checklist, unknown-tolerant answers, interview card UI.
- **Phase 3** ✅ — grounded final assessment (`final-assessment`), verdicts +
  interactions persisted, assessment view UI.
- **Phase 4** ✅ — comparative eval: manual baseline 1.0/1.0/1.0; AI engine
  0.857/0.833/1.0/0.909 (acc/prec/recall/F1) over the 6 benchmark cases
  (`docs/eval-ai-results.json`); full comparison in the eval dashboard.
- **Phase 5** 🔄 — RLS verified, audit rows live, docs in progress.

## Quickstart (current stack)

Prerequisites: Node 20+.

```powershell
# 1. Env files (see web/.env.example for the shape)
Copy-Item .env.example .env            # repo-root: SUPABASE_ACCESS_TOKEN (scripts)
Copy-Item web/.env.example web/.env.local   # web: SUPABASE_URL + keys

# 2. Run the app
start-rxguard.bat                       # or: cd web && npm run dev
#    http://localhost:3000  (demo login: dev.clinician@rxguard.dev / DevTest123!)
```

No local backend is needed — Postgres, Auth and the Edge Functions are already
deployed to the cloud Supabase project.

## Useful scripts

```powershell
# Apply a migration to the cloud project (network blocks direct Postgres ports)
.\supabase\scripts\apply-sql.ps1 <file.sql>

# Drive a full adaptive interview (Variant A/B) and print the question path
node supabase/scripts/interview-sim.mjs <prescriptionId> A

# Re-run the AI evaluation benchmark until all cases complete
node supabase/scripts/eval-ai-loop.mjs http://localhost:3000 6 150
```

## Verification

```powershell
cd web
npm run lint
npm run build
```

Edge Functions deploy with `npx supabase functions deploy <name> --project-ref <ref>`.
CI (`.github/workflows/ci.yml`) runs lint/build on the web app.

## Roadmap

See `plan.md` for the phase plan. Remaining Phase 5 work: final docs/report
artifacts and screenshots.