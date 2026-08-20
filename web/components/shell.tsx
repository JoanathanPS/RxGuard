"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function Shell({ email }: { email: string }) {
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-ink/15">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link
          href="/patients"
          className="text-sm font-bold tracking-[0.2em]"
        >
          RXGUARD
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/patients" className="hover:text-accent">
            Patients
          </Link>
          <span className="text-ink/50">{email}</span>
          <button
            onClick={signOut}
            className="rounded border border-ink/30 px-3 py-1 text-sm hover:bg-card"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}