import { useId, type ReactNode } from "react";
import Button from "@/components/ui/Button";
export default function ConfirmationPanel({ title, description, confirmLabel, busyLabel = "Working…", tone = "danger", confirmVariant = "danger", busy = false, onConfirm, onCancel, children }: { title: string; description: string; confirmLabel: string; busyLabel?: string; tone?: "danger" | "warning"; confirmVariant?: "danger" | "primary"; busy?: boolean; onConfirm: () => void; onCancel: () => void; children?: ReactNode }) {
  const titleId = useId();
  const panelTone = tone === "danger" ? "border-(--danger-border) bg-(--danger-soft)" : "border-(--warning-border) bg-(--warning-soft)";
  return <section className={`rounded-[12px] border p-4 ${panelTone}`} aria-labelledby={titleId}><h2 id={titleId} className="text-[14px] font-bold text-(--text-strong)">{title}</h2><p className="mt-1 max-w-[65ch] text-[12.5px] leading-relaxed text-(--text-muted)">{description}</p>{children}<div className="mt-4 flex flex-wrap gap-2"><Button variant={confirmVariant} loading={busy} loadingLabel={busyLabel} onClick={onConfirm}>{confirmLabel}</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button></div></section>;
}
