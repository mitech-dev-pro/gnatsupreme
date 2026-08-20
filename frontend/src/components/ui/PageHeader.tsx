import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
};

export default function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: PageHeaderProps) {
  return (
    <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-(--text-muted)">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[22px] font-extrabold leading-tight text-(--text-strong)">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-(--text-muted)">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
