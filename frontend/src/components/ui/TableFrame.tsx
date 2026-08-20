import type { ReactNode } from "react";

export default function TableFrame({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-(--border-default) bg-(--surface-raised)">
      <div className="overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
        <table className={`w-full text-left text-[12.5px] ${className}`}>{children}</table>
      </div>
    </div>
  );
}
