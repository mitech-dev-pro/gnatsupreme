import Button from "@/components/ui/Button";
export default function Pagination({ page, totalPages, totalItems, itemLabel = "items", onPageChange }: { page: number; totalPages: number; totalItems?: number; itemLabel?: string; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12.5px]" aria-label="Pagination"><span className="text-(--text-muted)" aria-live="polite">Page {page} of {totalPages}{typeof totalItems === "number" && ` · ${totalItems.toLocaleString()} ${itemLabel}`}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button></div></nav>;
}
