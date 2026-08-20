import type { ReactNode } from "react";

type AlertTone = "error" | "success" | "warning" | "info";

const alertStyles: Record<AlertTone, string> = {
  error: "border-(--danger-border) bg-(--danger-soft) text-(--danger)",
  success: "border-(--success-border) bg-(--success-soft) text-(--success)",
  warning: "border-(--warning-border) bg-(--warning-soft) text-(--warning)",
  info: "border-(--info-border) bg-(--info-soft) text-(--text-strong)",
};

export function Alert({
  tone = "info",
  children,
}: {
  tone?: AlertTone;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-[9px] border px-3 py-2.5 text-[12.5px] font-semibold ${alertStyles[tone]}`}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center px-5 py-8 text-center">
      <div
        aria-hidden="true"
        className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-(--surface-subtle) text-lg text-(--text-muted)"
      >
        ✓
      </div>
      <h2 className="text-[14px] font-bold text-(--text-strong)">{title}</h2>
      <p className="mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-(--text-muted)">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TableSkeleton({
  columns,
  rows = 5,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={row} aria-hidden="true">
          {Array.from({ length: columns }).map((__, column) => (
            <td key={column} className="px-4 py-3">
              <span className="block h-3 animate-pulse rounded bg-(--skeleton)" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
