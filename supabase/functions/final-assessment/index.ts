import { userClient, serviceClient } from "../shared/supabase.ts";
import { groqJson } from "../shared/groq.ts";
import { corsHeaders, corsOk } from "../shared/cors.ts";
import { loadGrounding, type Grounding } from "../shared/grounding.ts";
import { responsesToProfile } from "../shared/interview-context.ts";

const VERDICTS = new Set(["safe", "caution", "avoid"]);
const SEVERITIES = new Set(["critical", "high", "moderate", "low", "safe"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatGroundingText(grounding: Grounding): string {
  const parts: string[] = [];
  if (grounding.mapping.length) {
    parts.push(
      "DRUG RECORDS:\n" +
        grounding.mapping
          .map((m) =>
            `- ${m.drug_name} (RXCUI ${m.rxcui ?? "n/a"}): class=${m.drug_class ?? "unknown"}, mechanism_flag=${m.mechanism_flag}, risk_factor_flag=${m.risk_factor_flag}`,
          )
          .join("\n"),
    );
  }
  if (grounding.rules.length) {
    parts.push(
      "PATIENT-FACTOR RULES:\n" +
        grounding.rules
          .map((r) =>
            `- ${r.drug_name}: if ${r.trigger_type} ${r.trigger_condition} -> ${r.risk_level} (${r.effect ?? ""}${r.recommended_action ? `; action: ${r.recommended_action}` : ""})`,
          )
          .join("\n"),
    );
  }
  if (grounding.interactions.length) {
    parts.push(
      "KNOWN DRUG-DRUG INTERACTIONS:\n" +
        grounding.interactions
          .map((i) =>
            `- ${i.drug_a} + ${i.drug_b}: severity=${i.severity}${i.mechanism ? ` (${i.mechanism})` : ""}${i.action ? `; action: ${i.action}` : ""}`,
          )
          .join("\n"),
    );
  }
  if (grounding.live.length) {
    parts.push(
      "LIVE SOURCES (RxNorm):\n" +
        grounding.live
          .map((l) => `- RXCUI ${l.rxcui}: ${l.name ?? ""} [${(l.classes as string[]).join(", ")}]`)
          .join("\n"),
    );
  }
  return parts.length ? parts.join("\n\n") : "No local records matched — every claim must be flagged as unverified.";
}

function buildAssessmentMessages(params: {
  drugs: Array<{ drug_name: string; rxcui: string | null; dosage?: string | null; route?: string | null }>;
  profile: Record<string, unknown>;
  groundingText: string;
}) {
  const drugLines = params.drugs
    .map((d) => `- ${d.drug_name}${d.rxcui ? ` (RXCUI ${d.rxcui})` : ""}${d.dosage ? `, ${d.dosage}` : ""}${d.route ? `, ${d.route}` : ""}`)
    .join("\n");

  const profileLines = Object.entries(params.profile)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const system = `You are the final safety reviewer for RxGuard, an AI-assisted drug-safety capstone (research/educational). A patient's interview is complete and you must produce the FINAL assessment for each prescribed drug plus the cross-drug interaction list.

Grounding is the ONLY source of drug facts. You must attach a source to every claim, phrased like "per drug_patient_risk_rules" or "per interactions_seed". If no local record matches a drug or pair, mark the claim as "no local record - unverified, confirm with a pharmacist" and still give a verdict based on the patient profile, flagged as unverified.

VERDICTS: "safe" (no material risk), "caution" (monitor / dose-adjust / pharmacist review), "avoid" (contraindicated or serious risk). Base each verdict on the patient's distilled profile matched against the rules.

PRESCRIBED DRUGS:
${drugLines}

PATIENT PROFILE (distilled from interview answers):
${profileLines || "- (no structured answers)"}

GROUNDING (the ONLY allowed drug facts):
${params.groundingText}

Respond with JSON ONLY:
{"assessments":[{"drug_name":"exact drug name from PRESCRIBED DRUGS","verdict":"safe"|"caution"|"avoid","driving_factor":"the patient-specific factor that drove the verdict","side_effects":"plain-language summary of relevant risks","source_citation":"which grounding record / 'no local record - unverified'"}],"interactions":[{"drug_a":"","drug_b":"","severity":"critical"|"high"|"moderate"|"low"|"safe","mechanism":"short mechanism","explanation":"plain-language consequence"}],"combined_summary":"2-3 sentences for the clinician"} `;

  return [
    { role: "system" as const, content: system },
    {
      role: "user" as const,
      content:
        "The interview is complete. Produce the final assessment for this prescription.",
    },
  ];
}

/**
 * final-assessment
 *
 * Body: { prescription_id }
 * Requires a completed interview session for the prescription. Reads the full
 * answer set, loads grounding for the prescribed drugs, and asks Groq for a
 * grounded per-drug verdict + cross-drug interaction list. Writes results to
 * drug_assessments and interaction_results via the service client (RLS: the
 * owner can only read them back; only admins/service may write), and appends
 * an audit entry. Any drug or pair Groq invents that is not in the prescribed
 * list is rejected so the DB can never contain fabricated drugs.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);

    let body: { prescription_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid body" }, 400);
    }
    const prescriptionId: string = body.prescription_id ?? "";
    if (!prescriptionId) return json({ error: "prescription_id required" }, 400);

    const user = userClient(auth);
    const svc = serviceClient();

    const { data: rx, error: rxErr } = await user
      .from("prescriptions")
      .select("id, prescription_items(drug_name, rxcui, dosage, route)")
      .eq("id", prescriptionId)
      .single();
    if (rxErr || !rx) return json({ error: "forbidden" }, 403);

    const drugs = (rx.prescription_items as Array<{
      drug_name: string;
      rxcui: string | null;
      dosage?: string | null;
      route?: string | null;
    }> ?? []).map((d) => ({ ...d, drug_name: d.drug_name.trim().toLowerCase() }));
    if (drugs.length === 0) return json({ error: "prescription has no drugs" }, 400);

    const { data: session } = await user
      .from("interview_sessions")
      .select("id")
      .eq("prescription_id", prescriptionId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!session) return json({ error: "interview not completed" }, 409);

    const { data: responses } = await user
      .from("interview_responses")
      .select("field_name, question_text, answer, answered_at")
      .eq("session_id", session.id)
      .order("answered_at", { ascending: true });
    const { profile } = responsesToProfile(responses ?? []);

    const grounding = await loadGrounding(user, drugs, { live: true });
    const groundingText = formatGroundingText(grounding);

    const messages = buildAssessmentMessages({ drugs, profile, groundingText });
    const out = await groqJson(messages, { maxTokens: 1600 });

    const drugNames = new Set(drugs.map((d) => d.drug_name));
    const assessments = ((out.assessments as Array<Record<string, unknown>>) ?? [])
      .filter((a) => drugNames.has(String(a.drug_name ?? "").toLowerCase()))
      .map((a) => ({
        drug_name: String(a.drug_name).toLowerCase(),
        verdict: String(a.verdict ?? "safe").toLowerCase(),
        driving_factor: String(a.driving_factor ?? ""),
        side_effects: String(a.side_effects ?? ""),
        source_citation: String(a.source_citation ?? ""),
      }))
      .filter((a) => VERDICTS.has(a.verdict));

    const interactions = ((out.interactions as Array<Record<string, unknown>>) ?? [])
      .map((i) => ({
        drug_a: String(i.drug_a ?? "").toLowerCase(),
        drug_b: String(i.drug_b ?? "").toLowerCase(),
        severity: String(i.severity ?? "safe").toLowerCase(),
        mechanism: String(i.mechanism ?? ""),
        explanation: String(i.explanation ?? ""),
      }))
      .filter(
        (i) =>
          drugNames.has(i.drug_a) &&
          drugNames.has(i.drug_b) &&
          i.drug_a !== i.drug_b &&
          SEVERITIES.has(i.severity),
      );

    if (assessments.length === 0) {
      return json({ error: "assessment produced no valid verdicts" }, 400);
    }

    const now = new Date().toISOString();
    const { error: delAssErr } = await svc
      .from("drug_assessments")
      .delete()
      .eq("prescription_id", prescriptionId);
    if (delAssErr) return json({ error: delAssErr.message }, 500);

    const { error: insAssErr } = await svc.from("drug_assessments").insert(
      assessments.map((a) => ({ prescription_id: prescriptionId, ...a })),
    );
    if (insAssErr) return json({ error: insAssErr.message }, 500);

    const { error: delIntErr } = await svc
      .from("interaction_results")
      .delete()
      .eq("prescription_id", prescriptionId);
    if (delIntErr) return json({ error: delIntErr.message }, 500);

    const { error: insIntErr } = await svc.from("interaction_results").insert(
      interactions.map((i) => ({ prescription_id: prescriptionId, ...i, engine: "ai" })),
    );
    if (insIntErr) return json({ error: insIntErr.message }, 500);

    await svc.from("audit_log").insert({
      actor_id: (await user.auth.getUser()).data.user?.id ?? null,
      action: "assessment.completed",
      entity_type: "prescription",
      entity_id: prescriptionId,
      after: {
        drugs: drugs.map((d) => d.drug_name),
        assessment_count: assessments.length,
        interaction_count: interactions.length,
      },
    });

    const combinedSummary = String(out.combined_summary ?? "");
    await user
      .from("prescriptions")
      .update({ assessment_summary: combinedSummary })
      .eq("id", prescriptionId);

    return json({
      prescription_id: prescriptionId,
      assessments,
      interactions,
      combined_summary: combinedSummary,
      generated_at: now,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});