import type { ReactNode } from "react";
type Tone = "neutral" | "info" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = { neutral: "bg-(--surface-subtle) text-(--text-muted)", info: "bg-(--info-soft) text-(--text-strong)", success: "bg-(--success-soft) text-(--success)", warning: "bg-(--warning-soft) text-(--warning)", danger: "bg-(--danger-soft) text-(--danger)" };
const icons: Record<Tone, string> = { neutral: "•", info: "i", success: "✓", warning: "!", danger: "×" };
export default function StatusBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) { return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`}><span aria-hidden="true" className="font-extrabold">{icons[tone]}</span>{children}</span>; }
