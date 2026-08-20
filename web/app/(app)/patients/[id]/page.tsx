import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/types";

export const metadata: Metadata = {
  title: "Patient",
};

export const dynamic = "force-dynamic";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("*")
    .eq("id", id)
    .single();

  if (!patient) notFound();

  const { data: prescriptions } = await supabase
    .from("prescriptions")
    .select("*, prescription_items(*)")
    .eq("patient_id", id)
    .order("created_at", { ascending: false });

  interface RxRow {
    id: string;
    status: string;
    created_at: string;
    prescription_items: Array<{ id: string; drug_name: string }>;
  }
  const rxRows = (prescriptions ?? []) as RxRow[];

  const demos: Array<[string, string]> = [
    ["Age", patient.age != null ? `${patient.age} yrs` : "—"],
    ["Sex", patient.gender ?? "—"],
    ["Weight", patient.weight_kg != null ? `${patient.weight_kg} kg` : "—"],
    ["Height", patient.height_cm != null ? `${patient.height_cm} cm` : "—"],
    ["Pregnant", patient.pregnant == null ? "Not known" : patient.pregnant ? "Yes" : "No"],
    ["Breastfeeding", patient.breastfeeding == null ? "Not known" : patient.breastfeeding ? "Yes" : "No"],
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{patient.name}</h1>
          <p className="mt-1 text-sm text-ink/60">
            Added {formatDate(patient.created_at)}
          </p>
        </div>
        <Link
          href={`/prescriptions/new?patient=${patient.id}`}
          className="rounded border border-ink bg-ink px-4 py-2 text-sm font-medium text-canvas hover:bg-ink/90"
        >
          New prescription
        </Link>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink/60">
          Profile
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded border border-ink/20 p-4 text-sm md:grid-cols-3">
          {demos.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-ink/50">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink/60">
          Prescriptions
        </h2>
        {rxRows.length > 0 ? (
          <ul className="divide-y divide-ink/15 rounded border border-ink/20">
            {rxRows.map((rx) => (
              <li key={rx.id}>
                <Link
                  href={`/prescriptions/${rx.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-card"
                >
                  <span>
                    {rx.prescription_items
                      .map((i) => i.drug_name)
                      .join(" + ")}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-ink/50">
                      {formatDate(rx.created_at)}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        rx.status === "completed"
                          ? "bg-success/15 text-success"
                          : rx.status === "interviewing"
                            ? "bg-accent/15 text-accent"
                            : "bg-card text-ink/70"
                      }`}
                    >
                      {rx.status}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded border border-dashed border-ink/30 px-6 py-12 text-center text-sm text-ink/60">
            No prescriptions yet.
          </div>
        )}
      </div>
    </div>
  );
}