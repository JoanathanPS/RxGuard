// Drives the deployed interview-turn function through a full simulated
// interview and prints the question path. Used to demonstrate adaptivity:
// same drugs, different answer streams -> different question paths.
//
// Usage:
//   node supabase/scripts/interview-sim.mjs <prescriptionId> <A|B> [maxTurns]
//   Variant A: male, 72, denies everything else.
//   Variant B: female, 34, pregnant, reports CKD + diabetes, takes supplements.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const PRESCRIPTION_ID = process.argv[2];
const VARIANT = process.argv[3] || "A";
const MAX_TURNS = Number(process.argv[4] || 28);
const TURN_DELAY_MS = Number(process.argv[5] || 2500);
const EMAIL = "dev.clinician@rxguard.dev";
const PASSWORD = "DevTest123!";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = env;
const auth = {
  apikey: SUPABASE_ANON_KEY,
  "Content-Type": "application/json",
};

async function post(uri, body, headers = {}, retries = 4) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(uri, {
        method: "POST",
        headers: { ...auth, ...headers },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      if (!res.ok) {
        throw new Error(`${res.status} ${JSON.stringify(json ?? text).slice(0, 400)}`);
      }
      return json;
    } catch (e) {
      lastErr = e;
      const isNetwork =
        e instanceof TypeError || e.code === "ECONNRESET" || e.message?.includes("fetch failed");
      if (!isNetwork || attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function get(uri, headers = {}) {
  const res = await fetch(uri, { headers: { ...auth, ...headers } });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json ?? text).slice(0, 400)}`);
  return json;
}

const tok = await post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  email: EMAIL,
  password: PASSWORD,
});
const userHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${tok.access_token}`,
  "Content-Type": "application/json",
};

const profile = {
  A: { age: "72", gender: "male", pregnant: null },
  B: { age: "34", gender: "female", pregnant: "yes" },
}[VARIANT];

const questionPath = [];
let sessionId = null;
let count = 0;
let prevField = null;

for (let i = 0; i < MAX_TURNS; i++) {
  const body = { prescription_id: PRESCRIPTION_ID };
  if (sessionId) body.session_id = sessionId;

  const q = await post(
    `${SUPABASE_URL}/functions/v1/interview-turn`,
    body,
    userHeaders,
  );

  if (q.done) {
    console.log(`\nDONE after ${count} questions`);
    console.log(`summary: ${q.completion_summary}`);
    console.log(`PATH: ${questionPath.join(" | ")}`);
    process.exit(0);
  }

  const f = String(q.field_name);
  questionPath.push(f);

let answer = "";
  switch (q.question_type) {
    case "number": {
      if (f.includes("age")) answer = profile.age;
      else if (f.includes("weight")) answer = VARIANT === "A" ? "80" : "62";
      else if (f.includes("height")) answer = VARIANT === "A" ? "178" : "165";
      else if (f.includes("kidney") || f.includes("creatinine") || f.includes("egfr") || f.includes("gfr"))
        answer = VARIANT === "B" ? "1.8" : "don't know";
      else if (f.includes("inr") || f.includes("pt") || f.includes("coag"))
        answer = VARIANT === "A" ? "don't know" : "1.0";
      else if (f.includes("blood_sugar") || f.includes("hba1c") || f.includes("glucose"))
        answer = VARIANT === "B" ? "8.5" : "don't know";
      else if (f.includes("liver") || f.includes("alt") || f.includes("ast") || f.includes("bilirubin"))
        answer = "don't know";
      else if (f.includes("severity") || f.includes("scale") || f.includes("rate") || f.includes("urgency"))
        answer = VARIANT === "A" ? "6" : "4";
      else if (f.includes("potassium") || f.includes("sodium") || f.includes("electrolyte"))
        answer = "don't know";
      else if (f.includes("blood_pressure") || f.includes("heart_rate"))
        answer = VARIANT === "A" ? "135/85" : "118/74";
      else answer = "don't know";
      break;
    }
    case "boolean": {
      if (f.includes("pregnan")) answer = profile.pregnant ?? "no";
      else if (f.includes("breastfeed")) answer = "no";
      else if (f.includes("smok")) answer = "no";
      else if (f.includes("alcohol")) answer = VARIANT === "A" ? "no" : "yes";
      else answer = "no";
      break;
    }
    case "single-select": {
      if (f.includes("sex") || f.includes("gender")) answer = profile.gender;
      else if (f.includes("diabetes")) answer = VARIANT === "B" ? "yes" : "no";
      else if (f.includes("kidney") || f.includes("ckd") || f.includes("renal") || f.includes("chronic") || f.includes("conditions"))
        answer = VARIANT === "B" ? "yes" : "no";
      else if (f.includes("liver")) answer = "no";
      else if (f.includes("heart") || f.includes("cardiac") || f.includes("hypertension") || f.includes("blood pressure"))
        answer = "no";
      else if (f.includes("symptom") || f.includes("severity") || f.includes("urgent")) answer = "mild";
      else if (Array.isArray(q.options) && q.options.length) answer = q.options[0];
      else answer = "no";
      break;
    }
    case "multi-select": {
      if (f.includes("conditions") || f.includes("chronic"))
        answer = VARIANT === "B" ? ["diabetes", "chronic kidney disease"] : [];
      else if (f.includes("allerg")) answer = [];
      else if (f.includes("medication") || f.includes("supplement") || f.includes("current_medications"))
        answer = VARIANT === "B" ? ["vitamin D"] : [];
      else if (f.includes("surgery") || f.includes("hospital")) answer = [];
      else if (f.includes("family")) answer = [];
      else if (Array.isArray(q.options) && q.options.length) answer = [q.options[0]];
      else answer = [];
      break;
    }
    default: {
      if (f.includes("reason") || f.includes("symptom") || f.includes("presenting"))
        answer = "chest discomfort and shortness of breath";
      else if (f.includes("kidney") || f.includes("liver") || f.includes("blood_sugar") || f.includes("inr") || f.includes("electrolyte") || f.includes("blood_pressure"))
        answer = "don't know";
      else answer = "none";
    }
  }

  sessionId = q.session_id;
  await post(
    `${SUPABASE_URL}/rest/v1/interview_responses`,
    { session_id: sessionId, field_name: q.field_name, question_text: q.question_text, answer },
    userHeaders,
  );

count++;
  const shown = Array.isArray(answer) ? answer.join(",") : String(answer);
  console.log(
    `Q${String(count).padStart(2, " ")} [${q.question_type.padEnd(12)}] ${q.question_text}  => ${shown}`,
  );
  prevField = f;

  if (i < MAX_TURNS - 1) {
    await new Promise((r) => setTimeout(r, TURN_DELAY_MS));
  }
}

console.log(`REACHED MAX TURNS (${MAX_TURNS}) without completion`);
console.log(`PATH: ${questionPath.join(" | ")}`);
