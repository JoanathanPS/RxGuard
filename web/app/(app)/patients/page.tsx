import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, type Patient } from "@/lib/types";

export const metadata: Metadata = {
  title: "Patients",
};

export const dynamic = "force-dynamic";

export default async function PatientsPage() {
  const supabase = await createClient();
  const { data: patients } = await supabase
    .from("patients")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Patients</h1>
          <p className="mt-1 text-sm text-ink/60">
            {patients?.length ?? 0} patient(s) on file
          </p>
        </div>
        <Link
          href="/patients/new"
          className="rounded border border-ink bg-ink px-4 py-2 text-sm font-medium text-canvas hover:bg-ink/90"
        >
          New patient
        </Link>
      </div>

      {patients && patients.length > 0 ? (
        <ul className="divide-y divide-ink/15 rounded border border-ink/20">
          {patients.map((p: Patient) => (
            <li key={p.id}>
              <Link
                href={`/patients/${p.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-card"
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-ink/50">
                  {p.age != null ? `${p.age} yrs · ` : ""}
                  {p.gender ?? "—"} · added {formatDate(p.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded border border-dashed border-ink/30 px-6 py-16 text-center text-sm text-ink/60">
          No patients yet. Create one to start a prescription.
        </div>
      )}
    </div>
  );
}