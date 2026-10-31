import { Alert, EmptyState, TableSkeleton } from "@/components/ui/Feedback";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Pagination from "@/components/ui/Pagination";
import TableFrame from "@/components/ui/TableFrame";
import api from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { formatDateTime, inputClasses, useDebouncedValue, type AuditLog } from "./System.model";
export function AuditLogTab() {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const debouncedAction = useDebouncedValue(action);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get("/audit-logs", {
          signal,
          params: {
            page,
            limit: 30,
            search: debouncedSearch || undefined,
            action: debouncedAction || undefined,
          },
        });
        if (signal?.aborted) return;
        setRows(res.data.data);
        setTotal(res.data.pagination.total);
        setTotalPages(Math.max(1, res.data.pagination.totalPages));
      } catch {
        if (!signal?.aborted) setError("Audit log could not be loaded.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [debouncedAction, debouncedSearch, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search description"
          className={`max-w-72 ${inputClasses}`}
        />
        <input
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          placeholder="Filter by action (e.g. USER_CREATED)"
          className={`max-w-72 ${inputClasses}`}
        />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <TableFrame label="Audit log" className="min-w-200">
        <thead>
          <tr className="border-b border-border-default bg-surface-hover text-xs font-semibold uppercase tracking-wide text-text-muted">
            <th className="px-4 py-2.5">When</th>
            <th className="px-4 py-2.5">Actor</th>
            <th className="px-4 py-2.5">Action</th>
            <th className="px-4 py-2.5">Description</th>
            <th className="px-4 py-2.5">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <TableSkeleton columns={5} />
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <EmptyState
                  title="No audit entries found"
                  description="No recorded activity matches the current description and action filters."
                />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-b border-border-default last:border-0">
                <td className="px-4 py-2.5 text-text-muted">{formatDateTime(row.createdAt)}</td>
                <td className="px-4 py-2.5">{row.actor?.fullName ?? row.actorEmail ?? "System"}</td>
                <td className="px-4 py-2.5">
                  <code className="rounded bg-info-soft px-1.5 py-0.5 text-xs text-text-strong">
                    {row.action}
                  </code>
                </td>
                <td className="px-4 py-2.5 text-ink">{row.description}</td>
                <td className="px-4 py-2.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelected(row)}
                    aria-label={"View audit entry " + row.id}
                  >
                    View details
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableFrame>

      {selected && (
        <Dialog
          title="Audit entry details"
          description={"Entry #" + selected.id + " · " + formatDateTime(selected.createdAt)}
          onClose={() => setSelected(null)}
        >
          <dl className="mb-4 grid min-w-0 gap-3 text-sm">
            <div>
              <dt className="font-bold">Actor</dt>
              <dd className="wrap-anywhere">
                {selected.actor?.fullName ?? selected.actorEmail ?? "System"}
              </dd>
            </div>
            <div>
              <dt className="font-bold">Action</dt>
              <dd className="wrap-anywhere">{selected.action}</dd>
            </div>
            <div>
              <dt className="font-bold">Record</dt>
              <dd className="wrap-anywhere">
                {selected.entityType ?? "Not recorded"}
                {selected.entityId ? " #" + selected.entityId : ""}
              </dd>
            </div>
            <div>
              <dt className="font-bold">Description</dt>
              <dd className="wrap-anywhere">{selected.description}</dd>
            </div>
          </dl>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            {(
              [
                ["Before", selected.beforeData],
                ["After", selected.afterData],
              ] as const
            ).map(([label, data]) => (
              <section key={label} className="min-w-0" aria-label={label}>
                <h3 className="mb-2 text-sm font-bold">{label}</h3>
                {data == null ? (
                  <p className="text-sm text-text-muted">No snapshot recorded.</p>
                ) : (
                  <pre className="max-h-64 overflow-auto rounded-lg border border-border-default bg-surface-subtle p-3 text-xs">
                    {JSON.stringify(data, null, 2)}
                  </pre>
                )}
              </section>
            ))}
          </div>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
        </Dialog>
      )}
      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={total}
        itemLabel="entries"
        onPageChange={setPage}
      />
    </div>
  );
}
