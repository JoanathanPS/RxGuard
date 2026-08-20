import type { ChatMessage } from "./groq.ts";

/**
 * Section 4.2 of plan.md — the "menu" the model must cover before it may
 * declare the interview done. The model decides order, phrasing and which
 * items a given patient's answers skip or newly require.
 */
export const CHECKLIST = `
1. age
2. sex_gender
3. weight
4. height
5. pregnancy (female + reproductive age only)
6. breastfeeding (recent pregnancy only)
7. reason_for_prescription (presenting symptoms)
8. chronic_conditions (diabetes, hypertension, CKD, liver disease, cardiac, asthma/COPD, epilepsy, psychiatric, thyroid, cancer history)
9. past_surgeries_hospitalizations
10. drug_allergies (+ reaction severity)
11. other_allergies
12. current_medications (beyond this prescription)
13. smoking
14. alcohol
15. past_bad_drug_reaction
16. kidney_labs (creatinine / eGFR) if drug-relevant
17. liver_labs (ALT / AST / bilirubin) if drug-relevant
18. inr_pt (INR / PT) if anticoagulant-relevant
19. blood_sugar_labs (fasting glucose / HbA1c) if diabetes-relevant
20. electrolytes (potassium / sodium) if drug-relevant
21. blood_pressure_heart_rate if drug-class-relevant
22. family_history (hereditary conditions; low priority)
23. current_symptom_severity (urgency)`;

export interface ProfileAnswer {
  field_name: string;
  answer: unknown;
  question_text: string;
}

export interface InterviewResponseRow {
  field_name: string;
  question_text: string;
  answer: unknown;
  answered_at: string;
}

/**
 * Distills raw interview_responses rows into a compact structured profile
 * for the model to reason over, and reconstructs a short raw transcript.
 */
export function responsesToProfile(
  responses: InterviewResponseRow[],
): { profile: Record<string, unknown>; transcript: Array<{ q: string; a: string }> } {
  const profile: Record<string, unknown> = {};
  const transcript: Array<{ q: string; a: string }> = [];

  for (const r of responses) {
    let answer = r.answer;
    if (Array.isArray(answer)) {
      answer = answer.length > 0 ? answer.join(", ") : "none reported";
    }
    profile[r.field_name] = answer;
    transcript.push({ q: r.question_text, a: String(answer ?? "") });
  }

  return { profile, transcript };
}

function formatGrounding(
  grounding: {
    mapping: Array<Record<string, unknown>>;
    rules: Array<Record<string, unknown>>;
    interactions: Array<Record<string, unknown>>;
  },
): string {
  const parts: string[] = [];

  if (grounding.mapping.length) {
    parts.push(
      "DRUG RECORDS: " +
        grounding.mapping
          .map((m) =>
            `- ${m.drug_name}${m.rxcui ? ` (RXCUI ${m.rxcui})` : ""}: class=${m.drug_class ?? "unknown"}, mechanism_flag=${m.mechanism_flag}, risk_factor_flag=${m.risk_factor_flag}`,
          )
          .join("\n"),
    );
  }
  if (grounding.rules.length) {
    parts.push(
      "PATIENT-FACTOR RULES: " +
        grounding.rules
          .map((r) =>
            `- ${r.drug_name}: if ${r.trigger_type} = ${r.trigger_condition} -> ${r.risk_level} (${r.effect ?? ""}; ${r.recommended_action ?? ""})`,
          )
          .join("\n"),
    );
  }
  if (grounding.interactions.length) {
    parts.push(
      "KNOWN DRUG-DRUG INTERACTIONS: " +
        grounding.interactions
          .map((i) =>
            `- ${i.drug_a} + ${i.drug_b}: severity=${i.severity}${i.mechanism ? ` (${i.mechanism})` : ""}${i.action ? ` -> ${i.action}` : ""}`,
          )
          .join("\n"),
    );
  }
  return parts.length ? parts.join("\n\n") : "No local records matched these drugs — treat any claim about them as unverified.";
}

export function buildInterviewMessages(params: {
  drugs: Array<{ drug_name: string; rxcui: string | null; dosage?: string | null; route?: string | null }>;
  grounding: Parameters<typeof formatGrounding>[0];
  profile: Record<string, unknown>;
  transcript: Array<{ q: string; a: string }>;
}): ChatMessage[] {
  const drugLines = params.drugs
    .map((d) => `- ${d.drug_name}${d.rxcui ? ` (RXCUI ${d.rxcui})` : ""}${d.dosage ? `, ${d.dosage}` : ""}${d.route ? `, ${d.route}` : ""}`)
    .join("\n");

  const profileLines = Object.entries(params.profile)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const covered = Object.keys(params.profile);
  const coveredLines = covered.length
    ? covered.join(", ")
    : "(none yet)";

  const recent = params.transcript.slice(-3);
  const transcriptLines = recent.length
    ? recent.map((t) => `Q: ${t.q}\nA: ${t.a}`).join("\n\n")
    : "No questions answered yet.";

  const system = `You are the intake clinician for RxGuard, an AI-assisted drug-safety interviewer (a research/educational capstone). You are interviewing a patient before their prescription is finalized. You ask exactly ONE question per turn.

You are adaptive: choose the single most valuable next question given what is already known and what is still missing, and go deeper wherever an earlier answer raises a flag for the prescribed drugs. Do not ask questions that an earlier answer already covers. If an item does not apply to this patient (for example a pregnancy question for a male patient, or INR for a patient with no anticoagulant), note it as skipped and move on.

Rules:
- One question per turn, never two.
- "I don't know" is a valid answer (especially for lab values); it lowers confidence but does not block progress.
- Never invent drug facts. Only rely on the grounding provided. If a grounding section is missing for a drug, you may ask the patient about it, but never assert a fact you were not given.
- You may not set done=true until every checklist item that applies to this patient has been covered (or explicitly skipped as inapplicable).
- field_name MUST be one of the canonical snake_case IDs in the checklist above. When a checklist item is covered — answered, skipped as inapplicable, or the patient says they don't know — that exact ID must appear in ALREADY COVERED FIELDS. NEVER ask an item whose ID is already covered; if you need more detail, ask a NEW sub-question with a NEW snake_case field_name.

CHECKLIST (apply items 5, 6 and 16-21 only when triggered by this patient's answers or the prescribed drugs):
${CHECKLIST}

PRESCRIBED DRUGS:
${drugLines}

GROUNDING (the ONLY allowed drug facts):
${formatGrounding(params.grounding)}

PROFILE SO FAR (distilled from earlier answers):
${profileLines || "- (none yet)"}

ALREADY COVERED FIELDS (NEVER ask these again): ${coveredLines}

RECENT Q&A:
${transcriptLines}

Respond with JSON ONLY, exactly one object:
{"field_name":"snake_case_identifier","question_text":"a natural, one-at-a-time question in plain language","question_type":"single-select"|"multi-select"|"number"|"text"|"boolean","options":["..."] (required for single-select and multi-select),"urgency_reason":"short flag if this answer may change a verdict for a prescribed drug, else empty string","done":false}
Or, when the checklist is satisfied:
{"done":true,"completion_summary":"one short paragraph: what was covered and any residual uncertainty"} `;

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: "Continue the interview. What is your next question?",
    },
  ];
}