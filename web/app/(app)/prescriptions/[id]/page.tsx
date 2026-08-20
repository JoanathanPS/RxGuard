import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/types";

export const metadata: Metadata = {
  title: "Prescription",
};

export const dynamic = "force-dynamic";

export default async function PrescriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: rx } = await supabase
    .from("prescriptions")
    .select("*, prescription_items(*), patients(*)")
    .eq("id", id)
    .single();

  if (!rx) notFound();

  interface RxDetail {
    id: string;
    status: string;
    created_at: string;
    patients: { id: string; name: string };
    prescription_items: Array<{
      id: string;
      drug_name: string;
      rxcui: string | null;
      dosage: string | null;
      route: string | null;
    }>;
  }
  const detail = rx as RxDetail;
  const items = detail.prescription_items ?? [];

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Prescription</h1>
          <p className="mt-1 text-sm text-ink/60">
            {formatDate(detail.created_at)} · for{" "}
            <Link
              href={`/patients/${detail.patients.id}`}
              className="text-accent underline underline-offset-4"
            >
              {detail.patients.name}
            </Link>
          </p>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            detail.status === "completed"
              ? "bg-success/15 text-success"
              : detail.status === "interviewing"
                ? "bg-accent/15 text-accent"
                : "bg-card text-ink/70"
          }`}
        >
          {detail.status}
        </span>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink/60">
          Drugs
        </h2>
        <ul className="divide-y divide-ink/15 rounded border border-ink/20">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
              <span className="font-medium">{item.drug_name}</span>
              <span className="text-ink/50">
                {item.rxcui ? `RXCUI ${item.rxcui}` : "no catalog match"} ·{" "}
                {item.dosage ?? "—"} · {item.route ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded border border-dashed border-ink/30 px-6 py-10 text-center">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink/60">
          Safety interview
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-ink/60">
          The adaptive AI interview that checks these drugs against this
          patient&apos;s profile lands here (Phase 2), followed by the per-drug
          safety assessment (Phase 3).
        </p>
      </div>
    </div>
  );
}