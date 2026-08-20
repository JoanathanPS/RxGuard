"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";

type Mode = "sign-in" | "sign-up";

export function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setError(result.error.message);
      setPending(false);
      return;
    }

    router.push("/patients");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email">
        <TextInput
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Password">
        <TextInput
          type="password"
          required
          minLength={6}
          autoComplete={
            mode === "sign-in" ? "current-password" : "new-password"
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      {error && (
        <p className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending
          ? "Working…"
          : mode === "sign-in"
            ? "Sign in"
            : "Create account"}
      </Button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          setError(null);
        }}
        className="w-full text-center text-xs text-ink/60 underline underline-offset-4 hover:text-accent"
      >
        {mode === "sign-in"
          ? "New here? Create an account"
          : "Already have an account? Sign in"}
      </button>
    </form>
  );
}