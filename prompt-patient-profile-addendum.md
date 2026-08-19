# RxGuard — Addendum: Full Patient Profile Intake & Drug-Patient Safety Module

This extends `prompt.md` (the main build spec) and `prompt-patient-profile-addendum` supersedes nothing in it — read `prompt.md` first. This addendum adds a requirement raised by the project supervisor: the system must take in the *whole patient picture* (age, current status, known lab results, past medical history, allergies, everything available) and use it to judge whether the prescribed tablets themselves are actually safe for *this* patient — not just whether the drugs clash with each other.

Fold this into the existing phase plan rather than treating it as a new phase: the intake schema/UI belongs in **Phase 1** (it's part of Prescription Entry & Validation, Module 1), and the risk-scoring logic belongs in **Phase 2** alongside the AI/ML work already planned for the interaction engine (Module 2). Don't build this as a bolt-on after the fact — the drug-drug interaction engine and this drug-patient engine should share the same alert pipeline (Module 3) so a clinician sees one unified, severity-ranked list, not two disconnected reports.

---

## 1. Reference repos (for OpenCode to study, not copy wholesale)

No single repo matches RxGuard's exact scope (DDI checking + comparative AI-vs-manual study + patient-context risk), but these are useful for architecture and data-source patterns:

- [pillchecker-api](https://github.com/SPerekrestova/pillchecker-api) — a medication interaction checker API combining OpenMed + RxNorm + DrugBank; closest match to Module 2's drug-standardization + interaction-lookup pattern.
- [awesome-drug-interactions](https://github.com/MOB-sys/awesome-drug-interactions) — curated list of drug-interaction databases, APIs, and tools; useful for discovering additional free data sources beyond RxNorm/OpenFDA if the seed dataset needs expanding.
- [drug-interaction-checker (mohamedhenady)](https://github.com/mohamedhenady/drug-interaction-checker) — a minimal starting-point implementation; useful for seeing the simplest possible version of the core lookup loop before layering on RxGuard's N-ary/ML/LLM additions.
- [Healthcare-AI-Clinical-Decision-Support-System-using-LangGraph](https://github.com/SayamAlt/Healthcare-AI-Clinical-Decision-Support-System-using-LangGraph) — patient risk stratification + drug safety validation using an LLM graph pipeline; the closest existing pattern to *this addendum's* patient-context risk engine (worth reading for how it structures the "given this patient, is this drug/dose appropriate" reasoning step). Verify it's still live before relying on it — GitHub project availability/naming changes over time.
- [HealthRex/CDSS](https://github.com/HealthRex/CDSS) — Stanford's clinical decision support system; a much larger, real-world CDS codebase — useful for seeing how a production CDS structures patient data models and alerting, not for direct reuse.

None of these should be pulled in as a dependency — RxGuard's own services stay self-contained per `prompt.md`. Use them as design references only, and note in `docs/architecture.md` which patterns (if any) were borrowed from where.

---

## 2. What's missing from the original spec

`prompt.md`'s `patients` table (Section 5) only had `medical_history JSONB` — a single catch-all field. That's not enough to actually reason about drug safety per patient. This addendum expands patient data collection into structured, queryable fields, and adds a **Patient-Context Risk Engine** that runs in parallel with the existing Drug-Drug Interaction engine.

---

## 3. Expanded patient intake — what to collect

Collect this through a **multi-step adaptive form/wizard** in the frontend, not one giant page. Every field should have a "Don't know / Not available" option — never force a clinician to guess a lab value. When a value is missing, the risk engine (Section 4) must say so explicitly in its output ("assessment assumes normal renal function — no creatinine on file") rather than silently assuming it's normal.

**Demographics & current status**
- Age, sex/gender, weight, height (needed for dosing/BMI-sensitive rules)
- Pregnancy / breastfeeding status (ask only when age/sex make it relevant)
- Presenting symptoms / reason for visit
- Vitals if available: blood pressure, heart rate, temperature

**Known lab results** (all optional, all timestamped when entered)
- Renal function: serum creatinine, eGFR
- Liver function: ALT, AST, bilirubin
- Coagulation: INR/PT
- Electrolytes: potassium, sodium
- Blood sugar: fasting glucose, HbA1c
- CBC basics: hemoglobin, WBC, platelets

**Past medical history**
- Chronic conditions (structured multi-select + free text: diabetes, hypertension, chronic kidney disease, liver disease, cardiac disease, asthma/COPD, epilepsy, psychiatric conditions, etc.)
- Past surgeries / hospitalizations (free text, optional)

**Allergies**
- Drug allergies with reaction type and severity (e.g. "Penicillin — rash — moderate", "Sulfa drugs — anaphylaxis — severe")
- Food/other allergies (optional, lower priority)

**Lifestyle**
- Smoking status, alcohol use — only where it affects a rule in Section 4 (e.g. hepatotoxic drugs + heavy alcohol use)

### Adaptive questioning logic

The form should branch based on what's already known, not ask everything every time:

- If the prescription includes an anticoagulant (e.g. Warfarin) → prompt for INR/PT if not already on file.
- If the prescription includes a renally-cleared/nephrotoxic drug (e.g. Metformin, NSAIDs) or the patient has a kidney-related condition → prompt for creatinine/eGFR.
- If the patient is diabetic or the prescription affects glucose control → prompt for HbA1c/fasting glucose.
- If age ≥ 65 → surface a note that geriatric-specific precautions apply (Section 4) and prompt for renal function if not already collected (dosing is more often renally limited in this group).
- If age/sex indicate it's relevant → ask pregnancy/breastfeeding status before checking category-X-type drugs.

Implement this as a small rules-driven question sequencer (a table of `trigger → question` pairs is enough — this does not need an LLM), not hard-coded UI branches, so new triggers can be added by editing data rather than code.

---

## 4. Drug-Patient Safety / Side-Effect Engine (new — parallel to the DDI engine)

This is a **separate engine** from the drug-drug interaction engine in `prompt.md` Module 2 — it checks each drug **against the patient**, independent of what else is in the prescription. Keep it architecturally distinct (own function/module in `interaction-service`, own result table) but feed its output into the same `alert-service` pipeline so DDI alerts and patient-risk alerts show up together, severity-sorted, in one place for the clinician.

For every drug in the prescription, evaluate:

- **Renal dosing/contraindication** — e.g. Metformin generally avoided below an eGFR threshold; NSAIDs cautioned at reduced eGFR.
- **Hepatic impairment** — drugs with major hepatic metabolism flagged when ALT/AST are significantly elevated.
- **Age-based precaution** — pediatric dosing concerns; geriatric-specific cautions (e.g. certain sedatives/anticholinergics carry higher fall/confusion risk in elderly patients — this is the same spirit as clinical geriatric-prescribing guidance, without claiming to reproduce any specific licensed criteria set).
- **Pregnancy/breastfeeding** — drugs to avoid or use with caution in pregnancy/lactation (e.g. ACE inhibitors, Warfarin).
- **Allergy cross-reactivity** — e.g. penicillin allergy flags amoxicillin and, with lower confidence, cephalosporins.
- **Condition-based contraindication** — e.g. beta-blockers cautioned in asthma; NSAIDs cautioned with peptic ulcer history or kidney disease; ACE inhibitors/potassium-sparing drugs cautioned with a history of hyperkalemia.

**Output per drug — a suitability verdict, not just a yes/no:**

`Safe for this patient` / `Caution — monitor` / `Avoid — contraindicated`, each paired with the *specific patient factor* that triggered it — e.g. *"Avoid — recorded eGFR 25 mL/min; Metformin is generally avoided below 30."* A verdict with no supporting patient data on file should say so plainly — e.g. *"Assessment assumes normal renal function; no creatinine on file — confirm before relying on this."*

**Side-effect summary:** independent of contraindication status, surface a plain-language summary of common and serious side effects for each drug, generated the same way as the DDI explanation generator in `prompt.md` Module 3 — Groq LLM call, cross-checked against a local reference table so the LLM is explaining a grounded fact set rather than free-associating. Keep the same principle from the main spec: the LLM writes the explanation, a deterministic rule/table makes the actual safety call.

### New data file: `data/drug_patient_risk_rules.csv`

Structure it like `interactions_seed.csv` but keyed on a single drug plus a patient-factor trigger:

```
drug_name,trigger_type,trigger_condition,risk_level,effect,recommended_action
Metformin,lab,eGFR<30,Avoid,Risk of lactic acidosis in significant renal impairment,Avoid; consider alternative antidiabetic agent
Ibuprofen,lab,eGFR<60,Caution,Further renal function decline; fluid retention,Use lowest effective dose short-term; monitor renal function
Warfarin,pregnancy,pregnant,Avoid,Known teratogenic risk,Avoid in pregnancy; discuss alternative anticoagulation
Lisinopril,pregnancy,pregnant,Avoid,ACE inhibitors are contraindicated in pregnancy,Avoid in pregnancy; switch to a pregnancy-safe antihypertensive
Amoxicillin,allergy,penicillin_allergy,Avoid,Cross-reactivity with penicillin allergy,Avoid; consider a non-beta-lactam alternative
Ibuprofen,condition,peptic_ulcer_disease,Caution,Increased GI bleeding/ulceration risk,Use gastroprotection or avoid; consider acetaminophen
Propranolol,condition,asthma,Avoid,Non-selective beta-blockade can precipitate bronchospasm,Avoid; use a cardioselective agent if beta-blockade is essential
```
Seed it with roughly 15-20 rules spanning the trigger types above (lab threshold, condition, allergy, pregnancy, age) — enough to demonstrate the mechanism convincingly for the review/demo, not an exhaustive clinical reference.

---

## 5. Data model additions

Extend `patient-service` (replacing the single `medical_history JSONB` catch-all from `prompt.md` Section 5 with structured tables):

- `patients(id, name, age, gender, weight_kg, height_cm, pregnant, breastfeeding, created_by, created_at)`
- `patient_conditions(id, patient_id, condition_name, diagnosed_date, active)`
- `patient_allergies(id, patient_id, allergen, reaction, severity)`
- `patient_labs(id, patient_id, test_name, value, unit, recorded_at)`
- `patient_lifestyle(id, patient_id, smoking_status, alcohol_use)`

Extend `interaction-service`:

- `patient_risk_results(id, prescription_id, drug_name, trigger_type, trigger_detail, risk_level, effect, recommended_action, created_at)` — parallel to `interaction_results`, feeds the same alert pipeline.

---

## 6. API additions

- `POST /patients/{id}/labs`, `GET /patients/{id}/labs`
- `POST /patients/{id}/conditions`, `GET /patients/{id}/conditions`
- `POST /patients/{id}/allergies`, `GET /patients/{id}/allergies`
- `POST /interactions/check-patient-risk` — runs the Drug-Patient Safety Engine for a prescription against the patient's full profile
- Extend `POST /interactions/check` (from `prompt.md`) to internally call both the DDI engine and `check-patient-risk`, and return a single merged, severity-sorted result set

---

## 7. Frontend additions

- Multi-step adaptive patient intake wizard (Section 3), reusable for both new-patient creation and updating an existing patient's profile before a new prescription.
- On the prescription review page (from `prompt.md`), show patient-risk verdicts alongside DDI alerts in the same severity-sorted alert list, visually distinguishable by type (e.g. a small "drug-patient" vs "drug-drug" tag) but not in a separate disconnected panel.
- Side-effect summary shown per drug, expandable, separate from the contraindication verdict.

---

## 8. Deliverables checklist addition (extends `prompt.md` Section 13)

- [ ] Adaptive patient intake wizard collecting demographics, labs, conditions, allergies, lifestyle, with conditional follow-up questions.
- [ ] `data/drug_patient_risk_rules.csv` seeded and loaded.
- [ ] Patient-Context Risk Engine producing a suitability verdict + reason per drug, independent of the DDI engine.
- [ ] Missing-data cases handled explicitly (verdict states its assumptions rather than silently defaulting).
- [ ] DDI alerts and patient-risk alerts merged into one severity-sorted list in the UI.
- [ ] Side-effect summaries generated per drug (LLM explanation grounded in the local rule table, same pattern as the DDI explanation generator).
