import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Client that runs with the caller's JWT so Postgres RLS applies naturally.
 * Used for ownership checks and any client-visible reads.
 */
export function userClient(authHeader: string | null) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: authHeader ?? "" },
      },
    },
  );
}

/**
 * Service-role client for server-side writes (assessments, interaction
 * results, audit log). NEVER exposed to the browser. Writes are only
 * performed after the caller's ownership has been verified via userClient.
 */
export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function assertOwnsPrescription(
  user: ReturnType<typeof userClient>,
  prescriptionId: string,
) {
  const { data, error } = await user
    .from("prescriptions")
    .select("id")
    .eq("id", prescriptionId)
    .single();
  if (error || !data) throw new Error("forbidden");
  return data;
}