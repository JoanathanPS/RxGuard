import { userClient, serviceClient } from "../shared/supabase.ts";
import { groqJson } from "../shared/groq.ts";
import { corsHeaders, corsOk } from "../shared/cors.ts";
import { loadGrounding } from "../shared/grounding.ts";
import {
  buildInterviewMessages,
  responsesToProfile,
} from "../shared/interview-context.ts";

const QUESTION_TYPES = [
  "single-select",
  "multi-select",
  "number",
  "text",
  "boolean",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateQuestion(out: Record<string, unknown>) {
  if (typeof out.question_text !== "string" || !out.question_text.trim()) {
    throw new Error("Model returned a question without text");
  }
  const t = out.question_type as string;
  if (!QUESTION_TYPES.includes(t)) {
    throw new Error(`Model returned invalid question_type: ${t}`);
  }
  if (
    (t === "single-select" || t === "multi-select") &&
    !Array.isArray(out.options)
  ) {
    throw new Error("Select question returned without options");
  }
}

/**
 * interview-turn
 *
 * Body: { prescription_id, session_id? }
 * The function re-reads every answer stored on the session, distills the
 * profile, retrieves grounding for the prescribed drugs and asks Groq for the
 * single most valuable next question. When Groq sets done:true the session and
 * prescription are marked completed. Answers are written to interview_responses
 * by the client (RLS-enforced); this function is read-mostly.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk();
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);

    let body: { prescription_id?: string; session_id?: string | null } = {};
    try {
      body = await req.json();
    } catch (e) {
      return json(
        {
          error: `req.json failed: ${e instanceof Error ? e.message : String(e)}`,
          step: "req-json",
        },
        400,
      );
    }
    const prescriptionId: string = body.prescription_id ?? "";
    const sessionId: string | null = body.session_id ?? null;

    const user = userClient(auth);
    const svc = serviceClient();

    let step = "load-rx";
    const { data: rx, error: rxErr } = await user
      .from("prescriptions")
      .select("id, status, prescription_items(drug_name, rxcui, dosage, route)")
      .eq("id", prescriptionId)
      .single();
    if (rxErr || !rx) return json({ error: "forbidden" }, 403);

    // Ensure an active interview session.
    step = "load-session";
    let session: { id: string; status: string } | null = null;
    if (sessionId) {
      const { data } = await user
        .from("interview_sessions")
        .select("id, status")
        .eq("id", sessionId)
        .single();
      if (!data) return json({ error: "session not found" }, 404);
      session = data;
      if (session.status !== "in_progress") {
        return json({ error: "session already completed" }, 409);
      }
    } else {
      const { data, error } = await user
        .from("interview_sessions")
        .insert({ prescription_id: prescriptionId, status: "in_progress" })
        .select("id, status")
        .single();
      if (error) return json({ error: error.message }, 400);
      session = data;
      await user
        .from("prescriptions")
        .update({ status: "interviewing" })
        .eq("id", prescriptionId);
    }

    step = "load-responses";
    const { data: responses } = await user
      .from("interview_responses")
      .select("field_name, question_text, answer, answered_at")
      .eq("session_id", session.id)
      .order("answered_at", { ascending: true });

    step = "build-messages";
    const { profile, transcript } = responsesToProfile(responses ?? []);
    const drugs = rx.prescription_items as Array<{
      drug_name: string;
      rxcui: string | null;
      dosage?: string | null;
      route?: string | null;
    }>;
    const grounding = await loadGrounding(user, drugs);

    step = "groq";
    const messages = buildInterviewMessages({
      drugs,
      grounding,
      profile,
      transcript,
    });

    let out = await groqJson(messages, { maxTokens: 1200 });

    // Anti-repeat guard: if the model re-asks a field that is already covered,
    // nudge it once with the covered list and retry before accepting.
    if (!out.done && typeof out.field_name === "string" && profile[out.field_name] !== undefined) {
      step = "groq-retry";
      const retryMessages = buildInterviewMessages({
        drugs,
        grounding,
        profile,
        transcript,
      });
      retryMessages.push({
        role: "user",
        content:
          `You just asked about "${out.field_name}" but that field is ALREADY covered in the profile above. ` +
          "Pick a DIFFERENT open checklist item — do not repeat any covered field. Respond with the corrected JSON object.",
      });
      out = await groqJson(retryMessages, { maxTokens: 700 });
    }

    if (out.done) {
      step = "complete";
      const now = new Date().toISOString();
      await user
        .from("interview_sessions")
        .update({ status: "completed", completed_at: now })
        .eq("id", session.id);
      await user
        .from("prescriptions")
        .update({ status: "completed" })
        .eq("id", prescriptionId);

      step = "audit";
      await svc.from("audit_log").insert({
        actor_id: (await user.auth.getUser()).data.user?.id ?? null,
        action: "interview.completed",
        entity_type: "interview_session",
        entity_id: session.id,
        after: { completion_summary: out.completion_summary ?? "" },
      });

      return json({
        done: true,
        completion_summary: out.completion_summary ?? "",
        session_id: session.id,
        question_count: (responses ?? []).length,
      });
    }

    step = "validate";
    validateQuestion(out);

    return json({
      done: false,
      session_id: session.id,
      field_name: out.field_name ?? "answer",
      question_text: out.question_text,
      question_type: out.question_type,
      options: out.options ?? null,
      urgency_reason: out.urgency_reason ?? "",
    });
  } catch (e) {
    const err = e as Error & { stack?: string };
    return json(
      {
        error: err.message ?? String(e),
        step: (e as { step?: string }).step ?? "unknown",
        stack: err.stack ?? "",
      },
      400,
    );
  }
});