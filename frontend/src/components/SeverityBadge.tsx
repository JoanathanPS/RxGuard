import type { Severity } from "../types";

const severityStyles: Record<Severity, string> = {
  critical: "bg-red-700 text-white",
  high: "bg-orange-500 text-white",
  moderate: "bg-yellow-500 text-slate-900",
  low: "bg-yellow-300 text-slate-900",
  safe: "bg-green-500 text-white",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${severityStyles[severity]}`}
    >
      {severity}
    </span>
  );
}