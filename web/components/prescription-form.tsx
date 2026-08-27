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
  _confidence?: number;
  _unmatched?: boolean;
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

  const [parsingImage, setParsingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImageError(null);
    setParsingImage(true);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/parse-prescription-image`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ image: base64String }),
          }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to parse image");
        }

        const data = await res.json();
        const extracted = data.drugs || [];
        
        if (extracted.length === 0) {
          throw new Error("No drugs found in image");
        }

        const newRows = extracted.map((d: any, i: number) => ({
          key: Date.now() + i,
          name: d.drug_name,
          rxcui: d.rxcui,
          dosage: d.dosage,
          route: PRESCRIPTION_ROUTES.includes(d.route) ? d.route : "oral",
          _confidence: d.confidence,
          _unmatched: d.unmatched
        }));

        setRows((current) => {
          // If there's only one empty row, replace it. Otherwise append.
          if (current.length === 1 && !current[0].name) {
            return newRows;
          }
          return [...current, ...newRows];
        });
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setImageError(err.message);
    } finally {
      setParsingImage(false);
      // reset file input
      e.target.value = '';
    }
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
      
      // For any drugs still missing an RxCUI, search the live RxNorm API
      for (const name of missing) {
        if (!resolved[name]) {
          try {
            const res = await fetch(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name)}`);
            if (res.ok) {
              const body = await res.json();
              const rxcui = body?.idGroup?.rxnormId?.[0];
              if (rxcui) resolved[name] = rxcui;
            }
          } catch (e) {
            console.error("Failed to resolve RxCUI for", name, e);
          }
        }
      }
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
      
      {/* Upload Block */}
      <div className="rounded border border-dashed border-ink/40 p-6 flex flex-col items-center justify-center text-center bg-card/50">
        <p className="text-sm font-medium mb-2">Upload prescription photo</p>
        <p className="text-xs text-ink/60 mb-4 max-w-md">
          Automatically extract drugs from a physical prescription. You will review the list before saving.
        </p>
        <div className="relative">
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            disabled={parsingImage}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          <Button type="button" variant="ghost" disabled={parsingImage}>
            {parsingImage ? "Analyzing..." : "Choose Image"}
          </Button>
        </div>
        {imageError && (
          <p className="mt-3 text-xs text-danger bg-danger/10 px-2 py-1 rounded">{imageError}</p>
        )}
      </div>

      <div className="space-y-3">
        {rows.map((row, index) => {
          const needsReview = row._unmatched || (row._confidence !== undefined && row._confidence < 0.7);
          return (
            <div
              key={row.key}
              className={`rounded border p-4 ${needsReview ? "border-amber-500 bg-amber-500/5" : "border-ink/20"}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-ink/60">
                    Drug {index + 1}
                  </span>
                  {needsReview && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                      Needs Review
                    </span>
                  )}
                </div>
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
          );
        })}
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