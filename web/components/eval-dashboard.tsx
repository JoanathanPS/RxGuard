"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

interface RunRow {
  id: string;
  engine: "ai" | "manual";
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  fpr: number | null;
  fnr: number | null;
  avg_time_ms: number | null;
  created_at: string;
}

interface CaseOutcome {
  case_id: number;
  description: string;
  drugs: string[];
  expected: Record<string, string>;
  predicted: Record<string, string>;
  time_ms: number;
}

interface EvalResponse {
  runs: RunRow[];
  outcomes: Record<string, CaseOutcome[]>;
}

export function EvalDashboard() {
  const supabase = createClient();
  const [history, setHistory] = useState<RunRow[]>([]);
  const [latest, setLatest] = useState<EvalResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("evaluation_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(12);
    setHistory((data as RunRow[]) ?? []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("evaluation_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12);
      if (!cancelled) setHistory((data as RunRow[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/eval");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setLatest((await res.json()) as EvalResponse);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const chartData = ["accuracy", "precision", "recall", "f1", "fpr", "fnr"].map((m) => {
    const row: Record<string, string | number> = { metric: m };
    for (const eng of ["ai", "manual"] as const) {
      const r = latest?.runs.find((x) => x.engine === eng);
      row[eng] = r?.[m as keyof RunRow] ?? 0;
    }
    return row;
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Comparative evaluation</h1>
          <p className="mt-1 text-sm text-ink/60">
            AI-interview engine vs. manual reference-lookup baseline over the
            benchmark cases.
          </p>
        </div>
        <Button variant="accent" onClick={run} disabled={running}>
          {running ? "Running…" : "Run evaluation"}
        </Button>
      </div>

      {error && (
        <p className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {latest && (
        <>
          <div>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink/60">
              Metrics — latest run
            </h2>
            <div className="h-72 rounded border border-ink/20 bg-canvas p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(32,29,29,0.1)" />
                  <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="ai" fill="#007aff" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="manual" fill="#30d158" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink/60">
              Per-engine scores
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {(["ai", "manual"] as const).map((eng) => {
                const r = latest.runs.find((x) => x.engine === eng);
                if (!r) return null;
                return (
                  <div key={eng} className="rounded border border-ink/20 bg-canvas p-5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink/60">
                      {eng === "ai" ? "AI interview engine" : "Manual reference baseline"}
                    </h3>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      {(
                        [
                          ["Accuracy", r.accuracy],
                          ["Precision", r.precision],
                          ["Recall", r.recall],
                          ["F1", r.f1],
                          ["False positive rate", r.fpr],
                          ["False negative rate", r.fnr],
                          ["Avg time (ms)", r.avg_time_ms],
                        ] as Array<[string, number | null]>
                      ).map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-xs text-ink/50">{label}</dt>
                          <dd className="font-bold">
                            {value == null ? "—" : label.includes("time") ? value.toFixed(1) : (value * 100).toFixed(1) + "%"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink/60">
              Per-case verdicts
            </h2>
            <div className="space-y-3">
              {(latest.outcomes.manual ?? []).map((o) => {
                const aiOutcome = (latest.outcomes.ai ?? []).find((a) => a.case_id === o.case_id);
                return (
                  <div key={o.case_id} className="rounded border border-ink/20 bg-canvas p-4 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-bold">Case {o.case_id}</span>
                      <span className="text-ink/50">{o.drugs.join(" + ")}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink/50">{o.description}</p>
                    <table className="mt-3 w-full text-xs">
                      <thead>
                        <tr className="text-left text-ink/40">
                          <th className="py-1">Drug</th>
                          <th className="py-1">Expected</th>
                          <th className="py-1">AI</th>
                          <th className="py-1">Manual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.drugs.map((drug) => (
                          <tr key={drug} className="border-t border-ink/10">
                            <td className="py-1 capitalize">{drug}</td>
                            <td className="py-1">{o.expected[drug] ?? "—"}</td>
                            <td className="py-1">{aiOutcome?.predicted[drug] ?? "—"}</td>
                            <td className="py-1">{o.predicted[drug] ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink/60">
          Run history
        </h2>
        <div className="overflow-x-auto rounded border border-ink/20">
          <table className="w-full text-xs">
            <thead className="bg-card text-left">
              <tr>
                {["Engine", "Accuracy", "Precision", "Recall", "F1", "FPR", "FNR", "Avg ms", "When"].map((h) => (
                  <th key={h} className="px-3 py-2 font-bold uppercase tracking-wider text-ink/60">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id} className="border-t border-ink/10">
                  <td className="px-3 py-2">{r.engine}</td>
                  <td className="px-3 py-2">{r.accuracy == null ? "—" : (r.accuracy * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2">{r.precision == null ? "—" : (r.precision * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2">{r.recall == null ? "—" : (r.recall * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2">{r.f1 == null ? "—" : (r.f1 * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2">{r.fpr == null ? "—" : (r.fpr * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2">{r.fnr == null ? "—" : (r.fnr * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2">{r.avg_time_ms == null ? "—" : r.avg_time_ms.toFixed(1)}</td>
                  <td className="px-3 py-2 text-ink/50">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}