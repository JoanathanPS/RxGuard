// Resume-aware loop for the AI eval leg.
//
// The Groq free-tier TPD is a rolling window (~8.4k tokens/hour freed), so a
// full 6-case eval cannot usually run in one shot. This loop:
//   1. re-runs only the benchmark cases that have not completed yet
//      (eval route supports ?cases=1,3 for resume),
//   2. accumulates the per-case AI verdicts until all 6 cases have one,
//   3. computes the aggregate metrics over the accumulated verdicts (same
//      per-(case,drug) binarization as web/lib/engines/metrics.ts),
//   4. writes the full outcome table to docs/eval-ai-results.json.
//
// Every fetch carries an explicit timeout so a stale keep-alive connection can
// never stall the loop, and progress is flushed immediately.
//
// Usage:
//   node supabase/scripts/eval-ai-loop.mjs [baseUrl] [intervalMin] [maxWaitMin]

const BASE = process.argv[2] || "http://localhost:3000";
const INTERVAL_MIN = Number(process.argv[3] || 6);
const MAX_WAIT_MIN = Number(process.argv[4] || 150);

const TOTAL = 6;

const ANON =
  process.env.ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmZW1nemVkdmpwd2FlaXZmamhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxOTcxMTksImV4cCI6MjEwMjc3MzExOX0.118Vp8mAFb6T7vVvTGhE2A87yRxXvTG00ocNLFM6ACQ";

const log = (...args) => {
  process.stdout.write(`[${new Date().toISOString()}] ${args.join(" ")}\n`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postJson(url, { headers = {}, body } = {}, timeoutMs = 180_000) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json ?? text).slice(0, 400)}`);
  return json;
}

async function login() {
  const j = await postJson(
    "https://rfemgzedvjpwaeivfjhn.supabase.co/auth/v1/token?grant_type=password",
    {
      headers: { apikey: ANON },
      body: { email: "dev.clinician@rxguard.dev", password: "DevTest123!" },
    },
  );
  return (
    "sb-rfemgzedvjpwaeivfjhn-auth-token=" +
    encodeURIComponent(
      JSON.stringify({
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
      }),
    )
  );
}

async function runEval(cookie, casesArg) {
  const q = casesArg ? `&cases=${casesArg}` : "";
  const out = await postJson(`${BASE}/api/eval?engine=ai${q}`, { headers: { cookie }, body: {} });
  return (out.outcomes?.ai ?? []) || [];
}

// Same binarization as web/lib/engines/metrics.ts: caution|avoid = "action",
// safe/missing = safe. Matched per (case, drug).
function aggregateMetrics(cases) {
  const ACTION = new Set(["caution", "avoid"]);
  const pred = new Map();
  for (const o of cases) {
    for (const [drug, verdict] of Object.entries(o.predicted ?? {})) {
      pred.set(`${o.case_id}:${drug.toLowerCase()}`, verdict);
    }
  }
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (const o of cases) {
    for (const [drug, verdict] of Object.entries(o.expected ?? {})) {
      const p = pred.get(`${o.case_id}:${drug.toLowerCase()}`);
      const ea = ACTION.has(verdict);
      const pa = p ? ACTION.has(p) : false;
      if (ea && pa) tp++;
      else if (!ea && !pa) tn++;
      else if (!ea && pa) fp++;
      else fn++;
    }
  }
  const total = tp + tn + fp + fn || 1;
  return {
    accuracy: (tp + tn) / total,
    precision: tp + fp === 0 ? 0 : tp / (tp + fp),
    recall: tp + fn === 0 ? 0 : tp / (tp + fn),
    f1: tp + fp + fn === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn),
    fpr: tn + fp === 0 ? 0 : fp / (tn + fp),
    fnr: tp + fn === 0 ? 0 : fn / (tp + fn),
    tp, tn, fp, fn, n: total,
  };
}

process.on("unhandledRejection", (e) => {
  log("UNHANDLED REJECTION (continuing):", e?.message ?? e);
});

let cookie;
try {
  cookie = await login();
} catch (e) {
  log("login failed:", e.message);
  process.exit(1);
}

const deadline = Date.now() + MAX_WAIT_MIN * 60_000;
const outcomes = new Map(); // case_id -> CaseOutcome
let attempts = 0;

while (Date.now() < deadline) {
  attempts++;
  const done = [...outcomes.keys()];
  const pending = Array.from({ length: TOTAL }, (_, i) => i + 1).filter((n) => !done.includes(n));
  const casesArg = pending.length ? pending.join(",") : null;

  try {
    const started = Date.now();
    const cases = await runEval(cookie, casesArg);
    for (const o of cases) {
      if (!o.error) outcomes.set(o.case_id, o);
    }
    const nowDone = [...outcomes.keys()].sort((a, b) => a - b);
    const nowPending = Array.from({ length: TOTAL }, (_, i) => i + 1).filter((n) => !nowDone.includes(n));
    log(
      `attempt ${attempts} (ran ${casesArg ?? "all"}): ${nowDone.length}/${TOTAL} done` +
        `  done=[${nowDone.join(",")}] pending=[${nowPending.join(",")}]` +
        (cases.some((c) => c.error) ? `  sampleErr=${(cases.find((c) => c.error)?.error ?? "").slice(0, 90)}` : ""),
    );
    if (nowPending.length === 0) {
      const casesList = [...outcomes.values()].sort((a, b) => a.case_id - b.case_id);
      const m = aggregateMetrics(casesList);
      const summary = {
        engine: "ai",
        completed_cases: casesList.map((o) => o.case_id),
        metrics: m,
        cases: casesList.map((o) => ({
          case_id: o.case_id,
          description: o.description,
          drugs: o.drugs,
          expected: o.expected,
          predicted: o.predicted,
          time_ms: o.time_ms,
          interactions: o.interactions,
        })),
        note: "AI metrics aggregated across incremental runs; Groq free-tier rolling TPD forced sequential execution.",
      };
      try {
        const fs = await import("node:fs");
        fs.writeFileSync("docs/eval-ai-results.json", JSON.stringify(summary, null, 2));
        log(`wrote docs/eval-ai-results.json`);
      } catch (e) {
        log("could not write results file:", e.message);
      }
      log(
        `ALL ${TOTAL} CASES COMPLETED in ${attempts} attempts. ` +
          `acc=${m.accuracy.toFixed(3)} prec=${m.precision.toFixed(3)} rec=${m.recall.toFixed(3)} ` +
          `f1=${m.f1.toFixed(3)} fpr=${m.fpr.toFixed(3)} fnr=${m.fnr.toFixed(3)}`,
      );
      for (const o of casesList) {
        const matches = o.drugs.every(
          (d) => (o.predicted[d] ?? "safe") === (o.expected[d] ?? "safe"),
        );
        log(`  case ${o.case_id}: ${matches ? "MATCH" : "DIFF"} expected=${JSON.stringify(o.expected)} predicted=${JSON.stringify(o.predicted)}`);
      }
      process.exit(0);
    }
    const elapsed = (Date.now() - started) / 1000;
    const wait = Math.max(30, INTERVAL_MIN * 60 - elapsed);
    await sleep(wait * 1000);
  } catch (e) {
    log(`attempt ${attempts} failed (continuing):`, e.message);
    await sleep(60_000);
  }
}

log(`DEADLINE REACHED after ${attempts} attempts; done=${[...outcomes.keys()].join(",")}`);
process.exit(1);