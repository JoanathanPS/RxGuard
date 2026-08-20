"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type QuestionType = "single-select" | "multi-select" | "number" | "text" | "boolean";

interface InterviewTurn {
  done: boolean;
  session_id: string;
  field_name?: string;
  question_text?: string;
  question_type?: QuestionType;
  options?: string[] | null;
  urgency_reason?: string;
  completion_summary?: string;
  question_count?: number;
}

interface Props {
  prescriptionId: string;
  patientName: string;
  drugs: Array<{ drug_name: string; rxcui: string | null }>;
  sessionId: string | null;
}

export function Interview({ prescriptionId, patientName, drugs, sessionId }: Props) {
  const supabase = createClient();
  const [ready, setReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [question, setQuestion] = useState<InterviewTurn | null>(null);
  const [answered, setAnswered] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchTurn = useCallback(
    async (sid: string | null) => {
      setThinking(true);
      setError(null);
      try {
        const { data, error } = await supabase.functions.invoke<InterviewTurn>(
          "interview-turn",
          {
            body: { prescription_id: prescriptionId, session_id: sid },
          },
        );
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Empty response from interview-turn");
        setQuestion(data);
        if (data.done) {
          setAnswered(data.question_count ?? 0);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setThinking(false);
      }
    },
    [prescriptionId, supabase],
  );

  const start = useCallback(() => {
    setReady(true);
    void fetchTurn(sessionId);
  }, [sessionId, fetchTurn]);

  const submit = useCallback(
    async (answer: unknown) => {
      if (!question) return;
      setThinking(true);
      setError(null);
      const sid = question.session_id;
      try {
        const { error: insErr } = await supabase
          .from("interview_responses")
          .insert({
            session_id: sid,
            field_name: question.field_name,
            question_text: question.question_text,
            answer,
          });
        if (insErr) throw new Error(insErr.message);
        setAnswered((n) => n + 1);
        await fetchTurn(sid);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setThinking(false);
      }
    },
    [question, supabase, fetchTurn],
  );

  const num = answered + 1;
  const q = question;

  return (
    <div className="mx-auto flex min-h-[62vh] max-w-2xl flex-col">
      {!ready && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-1 flex-col justify-center"
        >
          <div className="rounded border border-ink/20 bg-canvas p-8">
            <p className="text-xs font-bold uppercase tracking-wider text-ink/60">
              Safety interview · {patientName}
            </p>
            <h2 className="mt-3 text-lg font-bold">
              Check this prescription against {patientName}&apos;s profile
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {drugs.map((d) => (
                <li
                  key={d.drug_name}
                  className="rounded bg-card px-3 py-1 text-xs text-ink/80"
                >
                  {d.drug_name}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-ink/60">
              An adaptive interview will ask one question at a time and go
              deeper wherever an answer raises a flag for these drugs. Answer
              honestly, or say “I don’t know” for lab values.
            </p>
            <div className="mt-6">
              <Button variant="accent" onClick={start}>
                Begin interview
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {ready && thinking && !q && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-1 flex-col items-center justify-center gap-4"
        >
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-2 w-2 rounded-full bg-ink/40"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
          <p className="text-sm text-ink/50">
            {question ? "Thinking about your answer…" : "Preparing your first question…"}
          </p>
        </motion.div>
      )}

      {ready && q && !q.done && (
        <div className="flex flex-1 flex-col justify-center">
          <div className="mb-4 flex items-center justify-between text-xs text-ink/50">
            <span className="font-bold uppercase tracking-wider">
              Building your safety profile
            </span>
            <span>question {num}</span>
          </div>
          <div className="mb-8 h-px w-full bg-ink/15">
            <div className="h-px w-1/3 bg-accent" />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={num}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.18 }}
            >
              {q.urgency_reason ? (
                <p className="mb-4 inline-block rounded bg-warn/15 px-3 py-1 text-xs text-warn">
                  {q.urgency_reason}
                </p>
              ) : null}
              <h2 className="text-xl font-bold leading-snug">{q.question_text}</h2>
              <div className="mt-8">
                <AnswerControls type={q.question_type ?? "text"} options={q.options ?? []} onSubmit={submit} disabled={thinking} />
              </div>
              <div className="mt-6">
                <button
                  onClick={() => submit("I don't know")}
                  className="text-xs text-ink/40 underline underline-offset-4 hover:text-ink"
                >
                  I don’t know
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {ready && q?.done && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-1 flex-col justify-center"
        >
          <div className="rounded border border-ink/20 bg-canvas p-8">
            <p className="text-xs font-bold uppercase tracking-wider text-success">
              Interview complete
            </p>
            <h2 className="mt-3 text-lg font-bold">
              {answered} question{answered === 1 ? "" : "s"} answered
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink/60">
              {q.completion_summary}
            </p>
            <div className="mt-6">
              <Button variant="primary" onClick={() => window.location.reload()}>
                View safety assessment
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {error && (
        <p className="mt-4 rounded border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function AnswerControls({
  type,
  options,
  onSubmit,
  disabled,
}: {
  type: QuestionType;
  options: string[];
  onSubmit: (value: unknown) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState<string>("");
  const [multi, setMulti] = useState<string[]>([]);

  switch (type) {
    case "number":
      return (
        <div className="flex items-center gap-3">
          <input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter a value"
            className="w-40 rounded border border-ink/30 bg-canvas px-3 py-2 text-sm placeholder:text-ink/40 focus:border-accent"
          />
          <Button onClick={() => value && onSubmit(Number(value))} disabled={disabled || !value}>
            Continue
          </Button>
        </div>
      );
    case "text":
      return (
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Type your answer"
            className="w-full rounded border border-ink/30 bg-canvas px-3 py-2 text-sm placeholder:text-ink/40 focus:border-accent"
          />
          <Button onClick={() => value.trim() && onSubmit(value.trim())} disabled={disabled || !value.trim()}>
            Continue
          </Button>
        </div>
      );
    case "boolean":
      return (
        <div className="flex gap-3">
          {["yes", "no"].map((o) => (
            <Button
              key={o}
              variant="ghost"
              onClick={() => onSubmit(o)}
              disabled={disabled}
              className="w-28 capitalize"
            >
              {o}
            </Button>
          ))}
        </div>
      );
    case "multi-select": {
      function toggle(opt: string) {
        setMulti((m) =>
          m.includes(opt) ? m.filter((x) => x !== opt) : [...m, opt],
        );
      }
      return (
        <div className="space-y-3">
          <ul className="space-y-2">
            {options.map((opt) => (
              <li key={opt}>
                <label className="flex cursor-pointer items-center gap-3 rounded border border-ink/25 px-4 py-3 text-sm hover:bg-card">
                  <input
                    type="checkbox"
                    checked={multi.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="accent-ink"
                  />
                  {opt}
                </label>
              </li>
            ))}
          </ul>
          <Button
            onClick={() => onSubmit(multi)}
            disabled={disabled || multi.length === 0}
          >
            Continue
          </Button>
        </div>
      );
    }
    case "single-select":
    default:
      return (
        <div className="space-y-3">
          <ul className="space-y-2">
            {options.map((opt) => (
              <li key={opt}>
                <button
                  onClick={() => onSubmit(opt)}
                  disabled={disabled}
                  className="w-full rounded border border-ink/25 px-4 py-3 text-left text-sm hover:bg-card"
                >
                  {opt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
  }
}