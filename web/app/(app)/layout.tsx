import { createClient } from "@/lib/supabase/server";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, display_name, role")
    .eq("id", user!.id)
    .single();

  return (
    <>
      <Shell email={profile?.email ?? user!.email ?? "user"} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
      <footer className="border-t border-ink/15 py-4 text-center text-xs text-ink/50">
        Research/educational capstone — not a certified medical device
      </footer>
    </>
  );
}