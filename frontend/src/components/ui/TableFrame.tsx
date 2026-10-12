import type { ReactNode } from "react";

export default function TableFrame({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border-default bg-(--surface-raised)">
      <div className="overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
        <table className={`w-full text-left text-sm ${className}`}>{children}</table>
      </div>
    </div>
  );
}
