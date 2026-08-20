import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EvalDashboard } from "@/components/eval-dashboard";

export const metadata: Metadata = {
  title: "Evaluation",
};

export const dynamic = "force-dynamic";

export default async function EvalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = profile?.role as string | undefined;
  if (!role || (role !== "researcher" && role !== "admin")) {
    redirect("/patients");
  }

  return <EvalDashboard />;
}