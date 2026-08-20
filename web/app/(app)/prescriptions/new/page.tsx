import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrescriptionForm } from "@/components/prescription-form";

export const metadata: Metadata = {
  title: "New prescription",
};

export const dynamic = "force-dynamic";

export default async function NewPrescriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const { patient } = await searchParams;
  if (!patient) notFound();

  const supabase = await createClient();
  const { data: patientRow } = await supabase
    .from("patients")
    .select("id, name")
    .eq("id", patient)
    .single();

  if (!patientRow) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">New prescription</h1>
          <p className="mt-1 text-sm text-ink/60">
            For <Link href={`/patients/${patientRow.id}`} className="text-accent underline underline-offset-4">{patientRow.name}</Link>
          </p>
        </div>
      </div>
      <PrescriptionForm patientId={patientRow.id} />
    </div>
  );
}