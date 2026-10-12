import { Alert, EmptyState, TableSkeleton } from "@/components/ui/Feedback";
import Pagination from "@/components/ui/Pagination";
import TableFrame from "@/components/ui/TableFrame";
import api from "@/lib/api";
import { Fragment, useCallback, useEffect, useState } from "react";
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
  const [expandedId, setExpandedId] = useState<number | null>(null);

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
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <TableSkeleton columns={4} />
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={4}>
                <EmptyState
                  title="No audit entries found"
                  description="No recorded activity matches the current description and action filters."
                />
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const hasDiff = row.beforeData !== null || row.afterData !== null;
              const expanded = expandedId === row.id;
              return (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => hasDiff && setExpandedId(expanded ? null : row.id)}
                    className={`border-b border-border-default last:border-0 ${hasDiff ? "cursor-pointer hover:bg-surface-hover" : ""}`}
                  >
                    <td className="px-4 py-2.5 text-text-muted">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      {row.actor?.fullName ?? row.actorEmail ?? "System"}
                    </td>
                    <td className="px-4 py-2.5">
                      <code className="rounded bg-info-soft px-1.5 py-0.5 text-xs text-text-strong">
                        {row.action}
                      </code>
                    </td>
                    <td className="px-4 py-2.5 text-ink">
                      {row.description}
                      {hasDiff && (
                        <span className="ml-2 text-xs font-semibold text-action-primary">
                          {expanded ? "Hide details" : "View details"}
                        </span>
                      )}
                    </td>
                  </tr>
                  {expanded && hasDiff && (
                    <tr className="border-b border-border-default bg-text-on-action last:border-0">
                      <td colSpan={4} className="px-4 py-3">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-text-muted">
                              Before
                            </div>
                            <pre className="max-h-64 overflow-auto rounded-lg border border-border-default bg-white p-2.5 text-xs text-ink">
                              {row.beforeData ? JSON.stringify(row.beforeData, null, 2) : "—"}
                            </pre>
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-text-muted">
                              After
                            </div>
                            <pre className="max-h-64 overflow-auto rounded-lg border border-border-default bg-white p-2.5 text-xs text-ink">
                              {row.afterData ? JSON.stringify(row.afterData, null, 2) : "—"}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </TableFrame>

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
