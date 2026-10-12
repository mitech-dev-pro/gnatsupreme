import type { ReactNode } from "react";
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-4 bg-surface-subtle px-3 py-2 text-lg font-extrabold text-text-strong">
      {children}
    </h2>
  );
}
export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-bold text-text-strong">{label}</div>
      <div className="min-h-10 rounded-lg border border-border-default bg-surface-subtle px-3 py-2.5 text-sm font-semibold text-ink">
        {value}
      </div>
    </div>
  );
}
export function Progress({ page, labels }: { page: number; labels: readonly string[] }) {
  return (
    <div
      className="flex justify-center gap-2 py-5"
      aria-label={`Step ${page + 1} of ${labels.length}`}
    >
      {labels.map((label, index) => (
        <span
          key={label}
          title={label}
          className={`h-2.5 rounded-full transition-[width,background-color] duration-200 ${index === page ? "w-8 bg-action-primary" : index < page ? "w-2.5 bg-success" : "w-2.5 bg-border-strong"}`}
        />
      ))}
    </div>
  );
}
