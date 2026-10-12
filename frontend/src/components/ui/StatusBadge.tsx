import type { ReactNode } from "react";
type Tone = "neutral" | "info" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-subtle text-text-muted",
  info: "bg-info-soft text-text-strong",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};
const dots: Record<Tone, string> = {
  neutral: "bg-text-muted",
  info: "bg-action-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};
export default function StatusBadge({
  tone = "neutral",
  dot = true,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {dot && <span aria-hidden="true" className={`size-1.5 rounded-full ${dots[tone]}`} />}
      {children}
    </span>
  );
}
