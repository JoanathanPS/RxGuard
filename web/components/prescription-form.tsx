"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/ui/field";
import { DrugPicker } from "@/components/drug-picker";
import { PRESCRIPTION_ROUTES, type DrugMapping } from "@/lib/types";

interface DrugRow {
  key: number;
  name: string;
  rxcui: string | null;
  dosage: string;
  route: string;
}

export function PrescriptionForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [rows, setRows] = useState<DrugRow[]>([
    { key: 1, name: "", rxcui: null, dosage: "", route: "oral" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function updateRow(key: number, patch: Partial<DrugRow>) {
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function addRow() {
    setRows((rs) => [
      ...rs,
      { key: Date.now(), name: "", rxcui: null, dosage: "", route: "oral" },
    ]);
  }

  function removeRow(key: number) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const drugs = rows.filter((r) => r.name.trim());
    const names = drugs.map((d) => d.name.trim().toLowerCase());
    if (drugs.length === 0) {
      setError("Add at least one drug.");
      return;
    }
    if (new Set(names).size !== names.length) {
      setError("Duplicate drug in the list.");
      return;
    }

    setPending(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in.");
      setPending(false);
      return;
    }

    const missing = drugs.filter((d) => !d.rxcui).map((d) => d.name.trim().toLowerCase());
    let resolved: Record<string, string> = {};
    if (missing.length > 0) {
      const { data } = await supabase
        .from("drug_mapping")
        .select("drug_name, rxcui")
        .in("drug_name", missing);
      resolved = Object.fromEntries(
        (data ?? [])
          .map((d) => [d.drug_name, d.rxcui] as const)
          .filter(([, r]) => r != null),
      );
    }

    const { data: rx, error: rxError } = await supabase
      .from("prescriptions")
      .insert({
        patient_id: patientId,
        clinician_id: user.id,
        status: "draft",
      })
      .select("id")
      .single();

    if (rxError) {
      setError(rxError.message);
      setPending(false);
      return;
    }

    const { error: itemsError } = await supabase
      .from("prescription_items")
      .insert(
        drugs.map((d) => {
          const name = d.name.trim().toLowerCase();
          return {
            prescription_id: rx.id,
            drug_name: name,
            rxcui: d.rxcui ?? resolved[name] ?? null,
            dosage: d.dosage.trim() || null,
            route: d.route || null,
          };
        }),
      );

    if (itemsError) {
      await supabase.from("prescriptions").delete().eq("id", rx.id);
      setError(itemsError.message);
      setPending(false);
      return;
    }

    router.push(`/prescriptions/${rx.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={row.key}
            className="rounded border border-ink/20 p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-ink/60">
                Drug {index + 1}
              </span>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  className="text-xs text-danger underline underline-offset-4"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-1">
                <Field label="Drug">
                  <DrugPicker
                    value={row.name}
                    onSelect={(drug: DrugMapping) =>
                      updateRow(row.key, {
                        name: drug.drug_name,
                        rxcui: drug.rxcui,
                      })
                    }
                    excluded={rows
                      .filter((r) => r.key !== row.key)
                      .map((r) => r.name.trim().toLowerCase())}
                  />
                </Field>
              </div>
              <Field label="Dosage">
                <TextInput
                  value={row.dosage}
                  onChange={(e) =>
                    updateRow(row.key, { dosage: e.target.value })
                  }
                  placeholder="e.g. 5 mg daily"
                />
              </Field>
              <Field label="Route">
                <Select
                  value={row.route}
                  onChange={(e) =>
                    updateRow(row.key, { route: e.target.value })
                  }
                >
                  {PRESCRIPTION_ROUTES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="rounded border border-dashed border-ink/40 px-4 py-2 text-sm hover:bg-card"
      >
        + Add drug
      </button>

      {error && (
        <p className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            router.push(
              `/patients/${searchParams.get("patient") ?? patientId}`,
            )
          }
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save prescription"}
        </Button>
      </div>
    </form>
  );
}