"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Verdict = "safe" | "caution" | "avoid";
type Severity = "critical" | "high" | "moderate" | "low" | "safe";

interface Assessment {
  drug_name: string;
  verdict: Verdict;
  driving_factor: string;
  side_effects: string;
  source_citation: string;
}

interface Interaction {
  drug_a: string;
  drug_b: string;
  severity: Severity;
  mechanism: string;
  explanation: string;
}

const verdictStyle: Record<Verdict, string> = {
  safe: "bg-success/15 text-success border-success/40",
  caution: "bg-warn/15 text-warn border-warn/40",
  avoid: "bg-danger/15 text-danger border-danger/40",
};

const verdictLabel: Record<Verdict, string> = {
  safe: "Safe",
  caution: "Caution",
  avoid: "Avoid",
};

const severityStyle: Record<Severity, string> = {
  critical: "bg-danger/15 text-danger border-danger/40",
  high: "bg-danger/10 text-danger border-danger/30",
  moderate: "bg-warn/15 text-warn border-warn/40",
  low: "bg-accent/10 text-accent border-accent/30",
  safe: "bg-success/15 text-success border-success/40",
};

export function AssessmentView({ prescriptionId }: { prescriptionId: string }) {
  const supabase = createClient();
  const [assessments, setAssessments] = useState<Assessment[] | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: ass }, { data: inter }, { data: rx }] = await Promise.all([
          supabase.from("drug_assessments").select("*").eq("prescription_id", prescriptionId),
          supabase.from("interaction_results").select("*").eq("prescription_id", prescriptionId),
          supabase.from("prescriptions").select("assessment_summary").eq("id", prescriptionId).single(),
        ]);
        if (cancelled) return;
        setAssessments((ass as Assessment[] | null) ?? []);
        setInteractions((inter as Interaction[] | null) ?? []);
        setSummary(rx?.assessment_summary ?? "");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prescriptionId, supabase]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("final-assessment", {
        body: { prescription_id: prescriptionId },
      });
      if (error) throw new Error(error.message);
      setAssessments((data?.assessments as Assessment[]) ?? []);
      setInteractions((data?.interactions as Interaction[]) ?? []);
      setSummary(data?.combined_summary ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [prescriptionId, supabase]);

  if (loading) {
    return (
      <p className="py-10 text-center text-sm text-ink/50">Loading assessment…</p>
    );
  }

  if ((assessments ?? []).length === 0) {
    return (
      <div className="mx-auto max-w-2xl rounded border border-dashed border-ink/30 px-6 py-12 text-center">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink/60">
          Safety assessment
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-ink/60">
          The interview is complete. Generate the grounded per-drug assessment
          and cross-drug interaction check for this prescription.
        </p>
        <div className="mt-6">
          <Button variant="accent" onClick={generate} disabled={generating}>
            {generating ? "Assessing…" : "Generate assessment"}
          </Button>
        </div>
        {error && (
          <p className="mt-4 rounded border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {summary && (
        <div className="rounded border border-ink/20 bg-canvas p-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink/60">
            Combined summary
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink/80">{summary}</p>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink/60">
          Per-drug assessment
        </h2>
        <div className="space-y-4">
          {(assessments ?? []).map((a) => (
            <div
              key={a.drug_name}
              className="rounded border border-ink/20 bg-canvas p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-bold capitalize">{a.drug_name}</h3>
                <span
                  className={`rounded border px-3 py-1 text-xs font-bold uppercase tracking-wider ${verdictStyle[a.verdict]}`}
                >
                  {verdictLabel[a.verdict]}
                </span>
              </div>
              {a.driving_factor && (
                <p className="mt-4 text-sm text-ink/80">
                  <span className="text-ink/50">Why: </span>
                  {a.driving_factor}
                </p>
              )}
              {a.side_effects && (
                <p className="mt-2 text-sm text-ink/80">
                  <span className="text-ink/50">Risks: </span>
                  {a.side_effects}
                </p>
              )}
              {a.source_citation && (
                <p className="mt-3 text-xs text-ink/40">
                  <span className="text-ink/50">Source: </span>
                  {a.source_citation}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {interactions.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink/60">
            Drug–drug interactions
          </h2>
          <div className="space-y-3">
            {interactions.map((i) => (
              <div
                key={`${i.drug_a}+${i.drug_b}`}
                className="rounded border border-ink/20 bg-canvas p-5"
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-sm font-bold capitalize">
                    {i.drug_a} + {i.drug_b}
                  </h3>
                  <span
                    className={`rounded border px-3 py-1 text-xs font-bold uppercase tracking-wider ${severityStyle[i.severity]}`}
                  >
                    {i.severity}
                  </span>
                </div>
                {i.mechanism && (
                  <p className="mt-3 text-sm text-ink/80">{i.mechanism}</p>
                )}
                {i.explanation && (
                  <p className="mt-2 text-sm text-ink/60">{i.explanation}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" onClick={generate} disabled={generating}>
          {generating ? "Re-assessing…" : "Regenerate assessment"}
        </Button>
      </div>

      {error && (
        <p className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}