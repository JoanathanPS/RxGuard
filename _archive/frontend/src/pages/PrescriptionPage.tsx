import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { checkInteractions } from "../api/interactions";
import { listPatients } from "../api/patients";
import { createPrescription, searchDrugs } from "../api/prescriptions";
import { SeverityBadge } from "../components/SeverityBadge";
import type { CheckResponse, DrugSearchResult } from "../types";

interface DraftItem {
  drug_name: string;
  dosage: string;
  route: string;
}

export default function PrescriptionPage() {
  const [params] = useSearchParams();
  const initialPatient = params.get("patient");

  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: listPatients });
  const [patientId, setPatientId] = useState<string>(initialPatient ?? "");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DrugSearchResult[]>([]);
  const [dosage, setDosage] = useState("");
  const [route, setRoute] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    searchDrugs(query)
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
  }, [query]);

  function addDrug(suggestion: DrugSearchResult) {
    if (items.some((i) => i.drug_name.toLowerCase() === suggestion.name)) {
      setError(`"${suggestion.name}" is already on this prescription.`);
      return;
    }
    setItems((prev) => [...prev, { drug_name: suggestion.name, dosage, route }]);
    setQuery("");
    setDosage("");
    setRoute("");
    setSuggestions([]);
    setError(null);
  }

  async function runCheck() {
    setError(null);
    setBusy(true);
    try {
      const rx = await createPrescription({
        patient_id: Number(patientId),
        items: items.map((i) => ({ drug_name: i.drug_name, dosage: i.dosage, route: i.route })),
      });
      const result = await checkInteractions({
        patient_id: Number(patientId),
        prescription_id: rx.id,
        drugs: items.map((i) => ({ drug_name: i.drug_name })),
      });
      setCheck(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setBusy(false);
    }
  }

  const canCheck = patientId && items.length >= 2;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">New prescription & interaction check</h2>

      <div className="grid gap-4 rounded-lg bg-white p-4 shadow-sm md:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">Patient</label>
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select…</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.age !== null ? `(${p.age})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Dosage</label>
          <input
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            placeholder="e.g. 5mg"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Route</label>
          <input
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="e.g. oral"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-lg bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">Add medication</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Start typing a drug name… (e.g. warfarin)"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {suggestions.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
            {suggestions.map((s) => (
              <li key={s.rxcui}>
                <button
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => addDrug(s)}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-slate-500">
                    {s.drug_class} · RXCUI {s.rxcui}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <ul className="mt-3 space-y-1">
            {items.map((item) => (
              <li
                key={item.drug_name}
                className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"
              >
                <span>
                  {item.drug_name}
                  <span className="text-slate-500">
                    {" "}
                    {item.dosage && `· ${item.dosage}`}
                    {item.route && ` · ${item.route}`}
                  </span>
                </span>
                <button
                  className="text-slate-400 hover:text-red-600"
                  onClick={() => setItems((prev) => prev.filter((i) => i !== item))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          disabled={!canCheck || busy}
          onClick={runCheck}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Check interactions"}
        </button>
        {items.length === 1 && (
          <p className="mt-2 text-xs text-slate-500">Add at least 2 medications to run a check.</p>
        )}
      </div>

      {check && (
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Interaction results</h3>
            <span className="text-xs text-slate-500">
              {check.pairs_checked} pairs · {check.detection_time_ms} ms · engine: {check.engine}
            </span>
          </div>
          <ul className="mt-3 space-y-3">
            {check.results.map((r) => (
              <li key={`${r.drug_a}-${r.drug_b}`} className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {r.drug_a} + {r.drug_b}
                  </span>
                  <SeverityBadge severity={r.severity} />
                </div>
                <p className="mt-1 text-sm text-slate-600">{r.mechanism}</p>
                {r.action && <p className="mt-1 text-sm text-slate-500">→ {r.action}</p>}
                <p className="mt-1 text-xs text-slate-400">
                  source: {r.source} · confidence: {r.confidence}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}