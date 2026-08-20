import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-[0.2em]">RXGUARD</h1>
          <p className="mt-2 text-sm text-ink/60">
            AI-assisted drug interaction check
          </p>
        </div>
        <div className="rounded border border-ink/20 p-6">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs leading-relaxed text-ink/50">
          Research/educational capstone — not a certified medical device.
          <br />
          Output is decision support only.
        </p>
      </div>
    </div>
  );
}