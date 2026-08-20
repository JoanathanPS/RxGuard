import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runManualEngine, type ManualInteraction, type ManualRule } from "@/lib/engines/manual";
import { computeMetrics, round4, type VerdictRow } from "@/lib/engines/metrics";

export const dynamic = "force-dynamic";

interface BenchmarkCase {
  id: number;
  description: string;
  drug_list: string[];
  expected_results: { verdicts: Record<string, string>; interactions?: Record<string, string> };
  patient_profile: Record<string, unknown> | null;
}

interface CaseOutcome {
  case_id: number;
  description: string;
  drugs: string[];
  expected: Record<string, string>;
  predicted: Record<string, string>;
  time_ms: number;
  interactions: unknown[];
  error?: string;
}

async function loadGrounding(svc: ReturnType<typeof createAdminClient>, names: string[]) {
  // No outer parens: supabase-js wraps `.or()` itself; parens would double-wrap.
  const orClause = names.flatMap((n) => [`drug_a.eq.${n}`, `drug_b.eq.${n}`]).join(",");
  const [, rules, interactions] = await Promise.all([
    names.length ? svc.from("drug_mapping").select("drug_name") : Promise.resolve({ data: [] }),
    names.length ? svc.from("drug_patient_risk_rules").select("*") : Promise.resolve({ data: [] }),
    names.length && orClause ? svc.from("interactions_seed").select("*").or(orClause) : Promise.resolve({ data: [] }),
  ]);
  return {
    rules: (rules.data ?? []) as ManualRule[],
    interactions: (interactions.data ?? []) as ManualInteraction[],
  };
}

// Replays one benchmark case through the deployed AI engine: creates a patient +
// prescription + completed session whose responses encode the case profile,
// then calls final-assessment. Returns the engine verdicts.
async function runAiCase(svc: ReturnType<typeof createAdminClient>, c: BenchmarkCase, ownerId: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const drugs = (c.drug_list ?? []).map((d) => String(d).trim().toLowerCase());

  const { data: patient, error: patErr } = await svc
    .from("patients")
    .insert({ created_by: ownerId, name: `Benchmark ${c.id}` })
    .select("id")
    .single();
  if (patErr || !patient) throw new Error(`patient insert: ${patErr?.message}`);

  const { data: rx, error: rxErr } = await svc
    .from("prescriptions")
    .insert({ patient_id: patient.id, clinician_id: ownerId, status: "completed" })
    .select("id")
    .single();
  if (rxErr || !rx) throw new Error(`prescription insert: ${rxErr?.message}`);

  const { error: itemsErr } = await svc.from("prescription_items").insert(
    drugs.map((d) => ({ prescription_id: rx.id, drug_name: d })),
  );
  if (itemsErr) throw new Error(`items insert: ${itemsErr.message}`);

  const { data: session, error: sessErr } = await svc
    .from("interview_sessions")
    .insert({ prescription_id: rx.id, status: "completed", completed_at: new Date().toISOString() })
    .select("id")
    .single();
  if (sessErr || !session) throw new Error(`session insert: ${sessErr?.message}`);

  const profile = (c.patient_profile ?? {}) as Record<string, unknown>;
  const responses = Object.entries(profile).map(([field_name, answer]) => ({
    session_id: session.id,
    field_name,
    question_text: "",
    answer: Array.isArray(answer) ? answer : String(answer),
  }));
  const { error: respErr } = await svc.from("interview_responses").insert(responses);
  if (respErr) throw new Error(`responses insert: ${respErr.message}`);

  const res = await fetch(`${url}/functions/v1/final-assessment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prescription_id: rx.id }),
  });
  const text = await res.text();
  // Clean up the fixture patient (cascades to prescription/session/responses)
  // whether the engine call succeeded or not, so re-runs don't accumulate rows.
  await svc.from("patients").delete().eq("id", patient.id);
  if (!res.ok) throw new Error(`final-assessment: ${res.status} ${text.slice(0, 300)}`);
  const data = JSON.parse(text);

  const verdicts: Record<string, string> = {};
  for (const a of data.assessments ?? []) verdicts[a.drug_name] = a.verdict;

  return {
    verdicts,
    interactions: data.interactions ?? [],
    summary: data.combined_summary ?? "",
  };
}

export async function POST(req: Request) {
  const engine = new URL(req.url).searchParams.get("engine") ?? "both";

  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await session
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = profile?.role as string | undefined;
  if (!role || !["researcher", "admin"].includes(role)) {
    return NextResponse.json({ error: "researcher or admin role required" }, { status: 403 });
  }

  const svc = createAdminClient();
  const { data: allCases, error: casesErr } = await svc
    .from("benchmark_cases")
    .select("*")
    .order("id", { ascending: true });
  if (casesErr) return NextResponse.json({ error: casesErr.message }, { status: 500 });
  let cases = allCases as BenchmarkCase[];
  const only = new URL(req.url)
    .searchParams.get("cases")
    ?.split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (only?.length) {
    cases = cases.filter((c) => only.includes(c.id));
  }
  const list = cases;

  const outcomes: Record<string, CaseOutcome[]> = {};
  const times: Record<string, number[]> = {};
  const runs: Array<{ engine: "ai" | "manual"; accuracy: number; precision: number; recall: number; f1: number; fpr: number; fnr: number; avg_time_ms: number }> = [];

  const engines = engine === "both" ? (["manual", "ai"] as const) : [engine as "manual" | "ai"];

  for (const eng of engines) {
    const perCase: CaseOutcome[] = [];
    for (const c of list) {
      const ground = await loadGrounding(svc, c.drug_list ?? []);
      const expected: Record<string, string> = c.expected_results?.verdicts ?? {};
      let predicted: Record<string, string> = {};
      let interactions: unknown[] = [];
      let error: string | undefined;
      const t0 = performance.now();

      if (eng === "manual") {
        const result = runManualEngine({
          drugs: (c.drug_list ?? []).map((d) => ({ drug_name: d })),
          profile: c.patient_profile ?? {},
          rules: ground.rules,
          interactions: ground.interactions,
        });
        predicted = Object.fromEntries(result.assessments.map((a) => [a.drug_name, a.verdict]));
        interactions = result.interactions;
      } else {
        try {
          const ai = await runAiCase(svc, c, user.id);
          predicted = ai.verdicts;
          interactions = ai.interactions;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
      }

      const timeMs = performance.now() - t0;
      (times[eng] ??= []).push(timeMs);
      perCase.push({
        case_id: c.id,
        description: c.description,
        drugs: c.drug_list ?? [],
        expected,
        predicted,
        time_ms: round4(timeMs),
        interactions,
        error,
      });
    }

    // Metrics cover the cases an engine actually completed; a failed case is
    // reported in the table but excluded from the aggregate so a single
    // provider hiccup doesn't distort the comparison.
    const completed = perCase.filter((o) => !o.error);
    const completedIds = new Set(completed.map((o) => o.case_id));
    const expectedRows: VerdictRow[] = list
      .filter((c) => completedIds.has(c.id))
      .flatMap((c) =>
        Object.entries(c.expected_results?.verdicts ?? {}).map(([drug, verdict]) => ({ caseId: c.id, drug, verdict })),
      );
    const predictedRows: VerdictRow[] = completed.flatMap((o) =>
      Object.entries(o.predicted).map(([drug, verdict]) => ({ caseId: o.case_id, drug, verdict })),
    );
    const metrics = computeMetrics(expectedRows, predictedRows);
    const avgTime = (times[eng] ?? []).reduce((a, b) => a + b, 0) / (times[eng]?.length || 1);

    const { error: insErr } = await svc.from("evaluation_runs").insert({
      engine: eng,
      accuracy: round4(metrics.accuracy),
      precision: round4(metrics.precision),
      recall: round4(metrics.recall),
      f1: round4(metrics.f1),
      fpr: round4(metrics.fpr),
      fnr: round4(metrics.fnr),
      avg_time_ms: round4(avgTime),
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    runs.push({
      engine: eng,
      accuracy: round4(metrics.accuracy),
      precision: round4(metrics.precision),
      recall: round4(metrics.recall),
      f1: round4(metrics.f1),
      fpr: round4(metrics.fpr),
      fnr: round4(metrics.fnr),
      avg_time_ms: round4(avgTime),
    });
    outcomes[eng] = perCase;
  }

  return NextResponse.json({ runs, outcomes });
}