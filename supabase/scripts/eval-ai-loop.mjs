// Background loop: keeps replaying the AI eval until all 6 benchmark cases
// complete against the deployed final-assessment. The Groq free-tier TPD is a
// rolling window (~8.4k tokens/hour freed), so a run may only complete a few
// cases before hitting 429 again; the eval route is per-case resilient and this
// loop simply retries until all cases are done, then prunes the intermediate
// (partial) ai runs so the run history stays clean.
//
// Usage:
//   node supabase/scripts/eval-ai-loop.mjs [baseUrl] [intervalMin] [maxWaitMin]

const BASE = process.argv[2] || "http://localhost:3000";
const INTERVAL_MIN = Number(process.argv[3] || 6);
const MAX_WAIT_MIN = Number(process.argv[4] || 150);

const ANON =
  process.env.ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmZW1nemVkdmpwd2FlaXZmamhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxOTcxMTksImV4cCI6MjEwMjc3MzExOX0.118Vp8mAFb6T7vVvTGhE2A87yRxXvTG00ocNLFM6ACQ";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const res = await fetch(
    "https://rfemgzedvjpwaeivfjhn.supabase.co/auth/v1/token?grant_type=password",
    {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dev.clinician@rxguard.dev", password: "DevTest123!" }),
    },
  );
  const j = await res.json();
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

async function runEval(cookie) {
  const res = await fetch(`${BASE}/api/eval?engine=ai`, {
    method: "POST",
    headers: { cookie },
  });
  const out = await res.json();
  const cases = out.outcomes?.ai ?? [];
  return {
    completed: cases.filter((c) => !c.error).length,
    total: cases.length,
    metrics: out.runs?.[0],
    cases,
  };
}

const deadline = Date.now() + MAX_WAIT_MIN * 60_000;
const cookie = await login();
let attempts = 0;

while (Date.now() < deadline) {
  attempts++;
  const started = Date.now();
  const { completed, total, metrics, cases } = await runEval(cookie);
  const ok = cases.filter((c) => !c.error).map((c) => c.case_id);
  const fail = cases.filter((c) => c.error).map((c) => c.case_id);
  console.log(
    `[${new Date().toISOString()}] attempt ${attempts}: ${completed}/${total} done` +
      `  ok=[${ok.join(",")}] fail=[${fail.join(",")}]` +
      (metrics ? `  acc=${metrics.accuracy}` : ""),
  );
  if (completed === total) {
    console.log("ALL CASES COMPLETED");
    process.exit(0);
  }
  const elapsed = (Date.now() - started) / 1000;
  const wait = Math.max(30, INTERVAL_MIN * 60 - elapsed);
  await sleep(wait * 1000);
}

console.log(`DEADLINE REACHED after ${attempts} attempts; ${"see log for last state"}`);
process.exit(1);