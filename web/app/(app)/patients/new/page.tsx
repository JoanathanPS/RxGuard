import type { Metadata } from "next";
import { PatientForm } from "@/components/patient-form";

export const metadata: Metadata = {
  title: "New patient",
};

export default function NewPatientPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">New patient</h1>
        <p className="mt-1 text-sm text-ink/60">
          The interview will fill in the rest later — add what you know now.
        </p>
      </div>
      <div className="rounded border border-ink/20 p-6">
        <PatientForm />
      </div>
    </div>
  );
}