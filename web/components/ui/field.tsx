import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

export const inputClass =
  "w-full rounded border border-ink/30 bg-canvas px-3 py-2 text-sm placeholder:text-ink/40 focus:border-accent";

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink/70">{label}</span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-xs text-ink/50">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      )}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputClass} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={inputClass} {...props} />;
}