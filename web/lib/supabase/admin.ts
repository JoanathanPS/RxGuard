import { createClient } from "@supabase/supabase-js";

// Server-only admin client (service role). Never imported from client
// components. Used by API routes that must bypass RLS (e.g. eval scoring),
// after the caller's role has been verified via the session client.
export function createAdminClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}