import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/types";
import { Interview } from "@/components/interview";
import { AssessmentView } from "@/components/assessment-view";

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

  const { data: session } = await supabase
    .from("interview_sessions")
    .select("id")
    .eq("prescription_id", id)
    .eq("status", "in_progress")
    .limit(1)
    .maybeSingle();

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

      {detail.status === "completed" ? (
        <AssessmentView prescriptionId={id} />
      ) : (
        <Interview
          prescriptionId={id}
          patientName={detail.patients.name}
          drugs={items.map((it) => ({ drug_name: it.drug_name, rxcui: it.rxcui }))}
          sessionId={session?.id ?? null}
        />
      )}
    </div>
  );
}