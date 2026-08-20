import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "accent" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "border-ink bg-ink text-canvas hover:bg-ink/90",
  accent: "border-accent bg-accent text-white hover:bg-accent/90",
  ghost: "border-ink/30 bg-transparent text-ink hover:bg-card",
  danger: "border-danger bg-danger text-white hover:bg-danger/90",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded border px-4 py-2 text-sm font-medium transition-colors active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}