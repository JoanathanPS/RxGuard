// Deterministic "manual / reference-lookup" baseline engine.
//
// Deliberately mirrors how a clinician manually checks a prescription against a
// formulary reference: direct pairwise interaction lookups + explicit
// patient-factor rules from the seeded tables. No LLM, no fuzzy matching, no
// live APIs. The AI engine (interview + final-assessment) is the other
// benchmarked path; this is the baseline it is compared against (Module 4 of
// the deck: "reference-based checking doesn't scale").

export interface ManualRule {
  drug_name: string;
  trigger_type: string;
  trigger_condition: string;
  risk_level: "safe" | "caution" | "avoid";
  effect: string | null;
  recommended_action: string | null;
}

export interface ManualInteraction {
  drug_a: string;
  drug_b: string;
  severity: "critical" | "high" | "moderate" | "low" | "safe";
  mechanism: string | null;
  action: string | null;
}

export interface ManualInput {
  drugs: Array<{ drug_name: string }>;
  profile: Record<string, unknown>;
  rules: ManualRule[];
  interactions: ManualInteraction[];
}

export interface ManualAssessment {
  drug_name: string;
  verdict: "safe" | "caution" | "avoid";
  driving_factor: string;
  side_effects: string;
  source_citation: string;
}

export interface ManualResult {
  assessments: ManualAssessment[];
  interactions: Array<{
    drug_a: string;
    drug_b: string;
    severity: ManualInteraction["severity"];
    mechanism: string;
    explanation: string;
  }>;
  combined_summary: string;
}

const verdictRank = { safe: 0, caution: 1, avoid: 2 } as const;
const severityRank = { safe: 0, low: 1, moderate: 2, high: 3, critical: 4 } as const;

function lower(s: unknown): string {
  return String(s ?? "").toLowerCase();
}

function firstNumber(text: unknown): number | null {
  const m = String(text ?? "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function profileHas(profile: Record<string, unknown>, keywords: string[]): boolean {
  const hay = Object.values(profile).map(lower).join(" ");
  return keywords.some((k) => hay.includes(k.toLowerCase()));
}

function matchesCondition(condition: string, profile: Record<string, unknown>): boolean {
  switch (condition) {
    case "peptic_ulcer_disease":
      return profileHas(profile, ["peptic", "ulcer", "gi bleed", "gi bleeding"]);
    case "asthma":
      return profileHas(profile, ["asthma", "copd"]);
    case "chronic_kidney_disease":
      return profileHas(profile, ["kidney disease", "chronic kidney", "ckd", "renal disease", "renal impairment"]);
    case "hyperkalemia_history":
      return profileHas(profile, ["hyperkalemia", "high potassium"]);
    default:
      return profileHas(profile, [condition.replaceAll("_", " ")]);
  }
}

// Extracts a lab value the same way a clinician would read a reported result:
// the relevant profile line is matched by lab name, then its number is taken.
function labValue(profile: Record<string, unknown>, lab: string): number | null {
  const key =
    lab === "egfr"
      ? "kidney_labs"
      : lab === "inr"
        ? "inr_pt"
        : lab === "potassium"
          ? "electrolytes"
          : lab === "hba1c"
            ? "blood_sugar_labs"
            : null;
  if (key && profile[key] !== undefined && !/don|unknow|not/i.test(String(profile[key]))) {
    const val = firstNumber(profile[key]);
    if (val !== null) return val;
  }
  // Fall back to scanning every profile line that mentions the lab name.
  for (const v of Object.values(profile)) {
    if (/don|unknow|not/i.test(String(v))) continue;
    if (String(v).toLowerCase().includes(lab)) {
      const val = firstNumber(v);
      if (val !== null) return val;
    }
  }
  return null;
}

function matchesLab(condition: string, profile: Record<string, unknown>): boolean {
  // Patterns from the seed: "eGFR<30", "eGFR30-45", "INR>3", "potassium>5.0".
  const m = condition.match(/^([A-Za-z]+)\s*([<>])?\s*(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?$/);
  if (!m) return false;
  const [, labName, op, loRaw, hiRaw] = m;
  const value = labValue(profile, labName.toLowerCase());
  if (value === null) return false;
  if (hiRaw) return value >= Number(loRaw) && value <= Number(hiRaw);
  if (op === "<") return value < Number(loRaw);
  if (op === ">") return value > Number(loRaw);
  return value === Number(loRaw);
}

function triggerMatches(rule: ManualRule, profile: Record<string, unknown>): boolean {
  switch (rule.trigger_type) {
    case "lab":
      return matchesLab(rule.trigger_condition, profile);
    case "condition":
      return matchesCondition(rule.trigger_condition, profile);
    case "allergy": {
      const kw =
        rule.trigger_condition === "penicillin_allergy"
          ? ["penicillin"]
          : rule.trigger_condition === "fluoroquinolone_allergy"
            ? ["fluoroquinolone", "ciprofloxacin", "levofloxacin"]
            : [rule.trigger_condition.replaceAll("_", " ")];
      const text = [lower(profile.drug_allergies), lower(profile.other_allergies)].join(" ");
      return text.length > 0 && kw.some((k) => text.includes(k));
    }
    case "pregnancy":
      return rule.trigger_condition === "pregnant"
        ? lower(profile.pregnancy) === "yes"
        : rule.trigger_condition === "breastfeeding"
          ? lower(profile.breastfeeding) === "yes"
          : false;
    case "age": {
      if (rule.trigger_condition !== "age_gt_65") return false;
      const age = firstNumber(profile.age);
      return age !== null && age > 65;
    }
    default:
      return false;
  }
}

export function runManualEngine(input: ManualInput): ManualResult {
  const names = input.drugs.map((d) => d.drug_name.trim().toLowerCase());
  const profile = input.profile;

  const matchedRules: Array<{ drug: string; rule: ManualRule }> = [];
  for (const rule of input.rules) {
    const drug = rule.drug_name.trim().toLowerCase();
    if (!names.includes(drug)) continue;
    if (triggerMatches(rule, profile)) matchedRules.push({ drug, rule });
  }

  // Pairwise interaction lookups (direct reference-table lookups only).
  const pairResults: Array<ManualInteraction & { found: boolean }> = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      const hit =
        input.interactions.find(
          (it) =>
            (it.drug_a.toLowerCase() === a && it.drug_b.toLowerCase() === b) ||
            (it.drug_a.toLowerCase() === b && it.drug_b.toLowerCase() === a),
        ) ?? null;
      pairResults.push(hit ? { ...hit, found: true } : { drug_a: a, drug_b: b, severity: "safe", mechanism: null, action: null, found: false });
    }
  }

  const interactions = pairResults.map((p) => ({
    drug_a: p.drug_a,
    drug_b: p.drug_b,
    severity: p.severity,
    mechanism: p.mechanism ?? "",
    explanation: p.action ?? (p.found ? "" : "No matching reference record — safe per local data."),
  }));

  const assessments: ManualAssessment[] = names.map((drug) => {
    let verdict: ManualAssessment["verdict"] = "safe";
    let driving = "";
    let sideEffects = "";
    let citation = `manual lookup: no matching rule for ${drug}`;

    for (const { rule } of matchedRules.filter((m) => m.drug === drug)) {
      if (verdictRank[rule.risk_level] > verdictRank[verdict]) {
        verdict = rule.risk_level;
        driving = `${rule.trigger_type} ${rule.trigger_condition}`;
        sideEffects = rule.effect ?? "";
        citation = `manual lookup: drug_patient_risk_rules (${rule.trigger_type} ${rule.trigger_condition})`;
      }
    }

    // Interaction-driven escalation: critical -> avoid, high/moderate -> caution.
    for (const p of pairResults.filter(
      (p) => (p.drug_a === drug || p.drug_b === drug) && p.found && severityRank[p.severity] >= severityRank.moderate,
    )) {
      const partner = p.drug_a === drug ? p.drug_b : p.drug_a;
      if (p.severity === "critical" && verdictRank[verdict] < 2) {
        verdict = "avoid";
        driving = `critical interaction with ${partner}`;
        citation = `manual lookup: interactions_seed (${p.drug_a} + ${p.drug_b})`;
      } else if (verdictRank[verdict] < 1) {
        verdict = "caution";
        driving = driving || `interaction with ${partner} (${p.severity})`;
        citation = `manual lookup: interactions_seed (${p.drug_a} + ${p.drug_b})`;
      }
    }

    return { drug_name: drug, verdict, driving_factor: driving, side_effects: sideEffects, source_citation: citation };
  });

  const riskiest = interactions.filter((i) => i.severity !== "safe");
  const combinedSummary =
    assessments.length === 0
      ? "No drugs to assess."
      : `${assessments.filter((a) => a.verdict === "safe").length} safe, ${assessments.filter((a) => a.verdict === "caution").length} caution, ${assessments.filter((a) => a.verdict === "avoid").length} avoid — ${
          riskiest.length ? `${riskiest.length} non-safe interaction${riskiest.length === 1 ? "" : "s"} found` : "no interactions found"
        } (reference lookup).`;

  return { assessments, interactions, combined_summary: combinedSummary };
}