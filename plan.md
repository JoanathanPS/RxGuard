# RxGuard — Fully AI-Attentive Build Plan (`plan.md`)

## 0. This supersedes the infra decisions in `prompt.md`

`prompt.md` and `prompt-patient-profile-addendum.md` are still the source of truth for *what RxGuard does* (the 4 modules, severity scale, comparative-evaluation thesis, disclaimers). This file replaces the *how* — specifically it drops the microservices/Kubernetes/ELK/Prometheus direction from `prompt.md` Section 2 in favor of a much leaner stack, and it replaces the rule-table-first interaction/intake design with an **LLM-led adaptive interview** as the centerpiece of the app.

**Why the pivot:** the deck (Review 1 material) described enterprise infrastructure because that's what a generic "production system" diagram looks like — but for Review 2, the thing that actually needs to impress is the intelligence of the app itself: does it interview a patient like a careful clinician would, and does it reason about their specific tablets well? A Kubernetes cluster demonstrates DevOps skill; it does not demonstrate that. Cutting the infra scope frees the entire build budget for the AI experience, which is also a stronger showcase of "AI" for an AI-track student than a REST CRUD app with an LLM bolted on for text generation.

**What's already on disk (confirmed in `App/` as of this plan):** `services/`, `frontend/`, `shared/`, `infra/`, `docs/`, `scripts/` from the earlier FastAPI/microservices phase; `data/interactions_seed.csv` and `data/drug_mapping.csv` (still reusable); `DESIGN.md` (from `getdesign`) and `skills-lock.json` (from `taste-skill`) — **both already installed**, but the current frontend was built before they landed, which is exactly why it renders as unstyled browser HTML. Don't re-run those install commands; the first real to-do below is rebuilding the frontend so it actually honors `DESIGN.md` and the taste-skill conventions.

---

## 1. Product vision

RxGuard should feel like being interviewed by a careful doctor before they write a prescription — not like filling out a hospital intake clipboard. The app asks one thing at a time, decides the next question from everything you've said so far, digs deeper wherever your answers raise a flag, and only stops once it actually has enough to judge every tablet on the list. Then it tells you, tablet by tablet, whether it's safe for *you specifically* — and why.

Two things must both be true at the end of the build:
1. The interview genuinely adapts — two patients on the same prescription get different question sequences if their answers differ.
2. Every safety claim the app makes is traceable to a real source (a retrieved drug record, a stated patient answer) — "fully AI" doesn't mean "unverifiable." See Section 4.

---

## 2. Final tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **Next.js (App Router) + TypeScript + Tailwind CSS** | Card-based interview UI, results dashboard, comparative-eval charts |
| Design system | **`getdesign` (DESIGN.md, already generated) + `Leonxlnx/taste-skill` (already installed)** | The frontend rebuild must be generated *with* these active, not styled by hand afterward |
| Backend / DB / Auth | **Supabase** (Postgres + Auth + Row Level Security + Storage + Edge Functions) | Replaces the FastAPI microservices layer entirely — see Section 3 |
| AI | **Groq API** | Drives the adaptive interview (function-calling / JSON mode) and the final per-drug assessment |
| Drug data | RxNorm + OpenFDA, local `data/interactions_seed.csv` + `data/drug_mapping.csv` + `data/drug_patient_risk_rules.csv` as grounding/fallback | Unchanged from `prompt.md` |
| Charts | Recharts (comparative-evaluation dashboard) | Unchanged |

## 3. Why Supabase replaces the microservices layer

One Postgres database with Row Level Security policies per role (Clinician/Pharmacist/Researcher/Admin) does everything the seven-service split in `prompt.md` was for, without the Docker Compose / Kubernetes / gateway overhead. Supabase Edge Functions (Deno, run `supabase functions deploy`) host the two pieces of real server logic:

- `interview-turn` — takes the conversation-so-far, calls Groq, returns the next question (or signals completion).
- `final-assessment` — takes the completed profile + drug list, retrieves grounding data, calls Groq for the verdicts, writes results to Postgres.

Supabase's own docs and examples back this pattern directly: [Edge Functions](https://supabase.com/docs/guides/functions), [AI Inference in Edge Functions](https://supabase.com/blog/ai-inference-now-available-in-supabase-edge-functions), [Running AI Models](https://supabase.com/docs/guides/functions/ai-models), and [chatgpt-your-files](https://github.com/supabase-community/chatgpt-your-files) (Supabase Community's RAG-over-Postgres chat MVP — the closest official example of "retrieve grounding data from Postgres, then call an LLM" that Section 4 needs).

The existing `services/interaction-service` rule/ML logic and `data/` seed files aren't wasted — they become the **grounding layer** the Edge Functions retrieve from before calling Groq (Section 4), either as a Postgres table Supabase queries directly or a small function-callable retrieval step. The FastAPI service code can be archived under `services/_archive/` for the report ("here's the earlier microservices exploration and why we moved off it") rather than deleted — that trade-off discussion is worth having in `docs/architecture.md`.

---

## 4. The Adaptive AI Interview Engine (core feature)

### 4.1 Loop design

Each turn:
1. Client sends the full conversation transcript + the drug list + the structured profile collected so far to the `interview-turn` Edge Function.
2. The function calls Groq with a system prompt instructing it to pick the single most valuable next question given what's still unknown and what's already been said — not a fixed script.
3. Groq responds using **structured output** (JSON mode, or tool-calling if the deployed Groq model supports it well): `{ field_name, question_text, question_type: "single-select"|"multi-select"|"number"|"text"|"boolean", options?, urgency_reason?, done: boolean }`.
4. The client renders one card for that question. The answer gets written to `interview_responses` (Section 5) and folded into the profile sent on the next turn.
5. Repeat until `done: true`.

Prefer tool-calling over free-text JSON if the chosen Groq model handles it reliably (test this early — Groq's tool-calling support varies by model); JSON mode is the safe fallback and is enough for this app's needs.

### 4.2 Minimum coverage checklist (the "menu," not a script)

The model is instructed to guarantee coverage of the following before it may set `done: true`, using its own judgment on order, phrasing, and which ones a given patient's earlier answers already skip or newly require. This alone is 20+ items, and any nontrivial case will exceed that once follow-up branches trigger:

1. Age · 2. Sex/gender · 3. Weight · 4. Height · 5. Pregnancy status (conditional) · 6. Breastfeeding status (conditional) · 7. Reason for this prescription / presenting symptoms · 8. Chronic conditions (diabetes, hypertension, CKD, liver disease, cardiac disease, asthma/COPD, epilepsy, psychiatric conditions, thyroid disorder, cancer history) · 9. Past surgeries/hospitalizations · 10. Drug allergies + reaction severity · 11. Other allergies · 12. Current medications/supplements besides this prescription · 13. Smoking status · 14. Alcohol use · 15. Any past bad reaction to a medication · 16. Kidney labs (creatinine/eGFR) if known · 17. Liver labs (ALT/AST/bilirubin) if known · 18. Coagulation labs (INR/PT) if anticoagulant-relevant · 19. Blood sugar labs (fasting glucose/HbA1c) if diabetes-relevant · 20. Electrolytes (potassium/sodium) if relevant to a prescribed drug · 21. Blood pressure/heart rate if relevant to a prescribed drug's class · 22. Family history of hereditary conditions (lower priority, ask if time allows) · 23. Current symptom severity/urgency.

Every "if relevant"/"if known" item's relevance is decided by the model against the actual prescribed drug list — this is what makes it adaptive rather than a static form with conditionals (contrast with the rule-driven sequencer described in `prompt-patient-profile-addendum.md` Section 3, which this design replaces).

### 4.3 Grounding — why "fully AI" doesn't mean "unverifiable"

At the final-assessment step, before Groq writes a single verdict, `final-assessment` retrieves the relevant records for each prescribed drug from Postgres (`interactions_seed`, `drug_mapping`, `drug_patient_risk_rules`, and live RxNorm/OpenFDA where reachable) and includes them in the prompt as the *only* facts Groq is allowed to cite. The model must attach a source to every claim ("per drug_patient_risk_rules: Metformin + eGFR<30 → Avoid" or "no local record — flagging as unverified, confirm with a pharmacist"). This is retrieval-augmented generation, not the old deterministic rule-gate — the LLM still leads all the reasoning and the interview; retrieval only stops it from inventing facts about specific drugs. State this distinction explicitly in `docs/architecture.md` since it's a real design decision worth defending in the viva.

### 4.4 Output

Per drug: verdict (`Safe` / `Caution` / `Avoid`), the patient-specific factor that drove it, a plain-language side-effect summary, and its source citation. Plus a combined section for drug-drug interactions across the full prescribed list (same severity scale as `prompt.md`: Critical/High/Moderate/Low/Safe).

---

## 5. Data model (Supabase Postgres)

- `profiles(id, email, role, display_name)` — Supabase Auth users + role, RLS keyed off this
- `patients(id, created_by, name, age, gender, weight_kg, height_cm, pregnant, breastfeeding, created_at)`
- `prescriptions(id, patient_id, clinician_id, status, created_at)`
- `prescription_items(id, prescription_id, drug_name, rxcui, dosage, route)`
- `interview_sessions(id, prescription_id, status, started_at, completed_at)`
- `interview_responses(id, session_id, field_name, question_text, answer, answered_at)` — full transcript, also the source of the structured profile
- `drug_assessments(id, prescription_id, drug_name, verdict, driving_factor, side_effects, source_citation, created_at)`
- `interaction_results(id, prescription_id, drug_a, drug_b, severity, mechanism, explanation, created_at)`
- `evaluation_runs(...)`, `benchmark_cases(...)` — unchanged from `prompt.md`, still meaningful: run the same benchmark prescriptions through the AI-interview-driven engine vs. a simulated manual/reference lookup for the comparative-evaluation module
- `audit_log(id, actor_id, action, entity_type, entity_id, before, after, created_at)` — append-only via RLS (INSERT/SELECT only for the app role)

RLS policies: Clinician/Pharmacist can read/write their own patients' data; Researcher/Analyst read-only on `evaluation_runs`/`audit_log`; Admin full access. Encode these as actual Postgres RLS policies, not just application-layer checks — that's the point of using Supabase.

---

## 6. Card-based UI

- One question per full-height card; smooth enter/exit transition; progress indicator ("Building your safety profile — question 9").
- Input widget matches `question_type` from the model (choice buttons, number field, free text, yes/no).
- "I don't know" always available for lab/history questions — the model must treat that as a real answer (reduced confidence), not a blocker.
- Thinking state between cards while `interview-turn` is running.
- Results view: one card per drug, color-coded by verdict (green/amber/red matching the severity palette already used for alerts), expandable for explanation + citation; a separate section for cross-drug interactions.
- All of this generated to match `DESIGN.md` and taste-skill's conventions already installed in the repo — that's the whole point of having run those tools first.

---

## 7. Reference repos & prior art (for OpenCode to study)

- [DocCHA — LLM-Augmented Interactive Online Diagnosis System](https://arxiv.org/html/2507.07870v1) — closest academic match to this exact feature (adaptive LLM-driven diagnostic questioning); worth citing in the capstone report as prior art the interview design is inspired by.
- [MedLinkAI+](https://github.com/lygitdata/MedLinkAI) — GenAI pre-diagnostic system doing personalized symptom interpretation from conversation.
- [Healthcare-AI-CDS-System-using-LangGraph](https://github.com/SayamAlt/Healthcare-AI-Clinical-Decision-Support-System-using-LangGraph) — patient risk stratification + drug safety validation from profile data (from the earlier addendum, still the closest match for Section 4.4's per-drug verdict output).
- [pillchecker-api](https://github.com/SPerekrestova/pillchecker-api) — RxNorm/DrugBank drug-standardization pattern for the grounding layer.
- [supabase-community/chatgpt-your-files](https://github.com/supabase-community/chatgpt-your-files) — the closest official Supabase example of "retrieve from Postgres, then call an LLM," i.e. exactly Section 4.3's grounding pattern, just swap OpenAI for Groq.
- [Leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill) and [getdesign](https://www.getdesign.app/) — already installed; read their own docs for how they expect the frontend to be generated so the rebuild in Phase 1 actually uses them correctly instead of fighting them.

---

## 8. Phased build plan

1. **Phase 0 — Supabase migration (new).** `supabase init`, create the schema in Section 5, set up Auth + RLS policies, migrate `data/*.csv` into Postgres tables, archive `services/` FastAPI code under `services/_archive/` with a short note on why. Wire `.env` for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`.
2. **Phase 1 — Frontend rebuild, done right.** Regenerate the Next.js + Tailwind frontend *using* `DESIGN.md`/taste-skill from the start: auth pages, patient list/detail, and a working (even if temporarily scripted/non-adaptive) prescription entry flow, so there's a real UI shell before the AI interview logic lands on top of it.
3. **Phase 2 — Interview engine.** Build `interview-turn` Edge Function + the card UI from Section 4.1-4.2. Test that two different patient answers on the same drug list actually produce different question paths — that's the acceptance test for "adaptive," not just "it asks 20 questions."
4. **Phase 3 — Grounding + final assessment.** Build `final-assessment` Edge Function (Section 4.3), the drug-drug interaction check across the prescribed list, and the results cards (Section 6).
5. **Phase 4 — Comparative evaluation.** Re-run `prompt.md`'s comparative-evaluation module against benchmark cases: the AI-interview-driven engine vs. a simulated manual/reference-only baseline, same metrics (accuracy/precision/recall/F1/FPR/FNR/time).
6. **Phase 5 — Audit, RBAC polish, report artifacts.** Audit log wired to every assessment/override, RLS verified per role, `docs/architecture.md` finalized with the pivot rationale and the "Deviations from the original design" ledger (now including this Supabase/AI-first pivot itself), screenshots/exports for the review report.

Deploy target: Supabase-hosted Postgres/Auth/Edge Functions (free tier is enough for a capstone demo) + the Next.js frontend on Vercel or run locally for the demo — no Kubernetes/Docker Compose stack required for this version. If a deployment story is still wanted for the DevOps grading criterion, note it as an optional Phase 6 rather than a blocker for the core feature.

### Build status (tracked 2026-08-21)

- **Phase 0 — Supabase migration** ✅ — schema 0001 + seed 0002 + benchmark 0003
  applied to the cloud project `rfemgzedvjpwaeivfjhn`; archived stack in
  `_archive/`.
- **Phase 1 — Frontend rebuild** ✅ — Next.js auth/patients/prescriptions with RLS.
- **Phase 2 — Interview engine** ✅ — `interview-turn` deployed; acceptance test
  passed: Variant A (male/72, denies) → 20 questions, Variant B (female/34,
  pregnant, CKD+diabetes) → 23 questions with pregnancy/kidney branches early;
  no repeated fields, no lab loop.
- **Phase 3 — Grounding + final assessment** ✅ — `final-assessment` deployed;
  live e2e on warfarin+aspirin+metformin in a pregnant CKD patient produced
  warfarin→avoid (pregnancy), aspirin→caution, metformin→caution, warfarin+aspirin
  →high; results + summary + audit rows persisted.
- **Phase 4 — Comparative evaluation** ✅ — manual baseline 1.0/1.0/1.0; AI leg
  0.857/0.833/1.0/0.909 (acc/prec/recall/F1, FPR 0.5, FNR 0) aggregated across
  incremental runs (`docs/eval-ai-results.json`); full comparison visible in
  the eval dashboard.
- **Phase 5 — Audit, RBAC, artifacts** 🔄 — RLS verified per role, audit rows
  live, `architecture.md` finalized; screenshots pending.

---

## 9. Deliverables checklist

- [x] Supabase project provisioned, schema + RLS applied.
- [x] `DESIGN.md`/taste-skill-conformant frontend actually replaces the current unstyled UI.
- [x] Adaptive interview demonstrably changes its question path across at least two different test patients on the same prescription.
- [x] Every drug verdict in the results view shows a source citation, and gracefully flags when no grounding record exists.
- [x] Comparative-evaluation dashboard: AI-interview engine vs. simulated manual baseline, same metrics as `prompt.md`.
- [x] Audit log + RLS enforced per role.
- [x] `docs/architecture.md` documents the pivot from microservices to Supabase and from rule-driven to LLM-led interview, with rationale.
- [x] "Research/educational — not a certified medical device" disclaimer retained in the UI.

## 10. Open items

- Review-report screenshots (login ✓ captured; interview card / assessment view
  / eval dashboard) — capture in a browser at `http://localhost:3000`.
