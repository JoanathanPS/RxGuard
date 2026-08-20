"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/ui/field";

type UnknownBool = "unknown" | "yes" | "no";

export function PatientForm() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [pregnant, setPregnant] = useState<UnknownBool>("unknown");
  const [breastfeeding, setBreastfeeding] = useState<UnknownBool>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in.");
      setPending(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("patients")
      .insert({
        created_by: user.id,
        name: name.trim(),
        age: age ? Number(age) : null,
        gender: gender || null,
        weight_kg: weightKg ? Number(weightKg) : null,
        height_cm: heightCm ? Number(heightCm) : null,
        pregnant: pregnant === "unknown" ? null : pregnant === "yes",
        breastfeeding:
          breastfeeding === "unknown" ? null : breastfeeding === "yes",
      })
      .select("id")
      .single();

    if (insertError) {
      setError(insertError.message);
      setPending(false);
      return;
    }

    router.push(`/patients/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Full name">
        <TextInput
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Anita Sharma"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Age (years)">
          <TextInput
            type="number"
            min={0}
            max={130}
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
        </Field>
        <Field label="Sex/gender">
          <Select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
          >
            <option value="">Not specified</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Weight (kg)">
          <TextInput
            type="number"
            step="0.1"
            min={0}
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
        </Field>
        <Field label="Height (cm)">
          <TextInput
            type="number"
            min={0}
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Pregnant">
          <Select
            value={pregnant}
            onChange={(e) => setPregnant(e.target.value as UnknownBool)}
          >
            <option value="unknown">Not known</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
        <Field label="Breastfeeding">
          <Select
            value={breastfeeding}
            onChange={(e) =>
              setBreastfeeding(e.target.value as UnknownBool)
            }
          >
            <option value="unknown">Not known</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
      </div>

      {error && (
        <p className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save patient"}
        </Button>
      </div>
    </form>
  );
}