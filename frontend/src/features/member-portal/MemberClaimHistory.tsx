import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Button from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import TableFrame from "@/components/ui/TableFrame";
import DateField from "@/components/ui/DateField";
import { SelectField } from "@/components/ui/FormField";
import api from "@/lib/api";
import { claimStatusTone } from "@/lib/claimStatus";
import { formatCurrency } from "@/lib/currency";
import type { ClaimHistoryItem } from "./MemberHome.shared";
import { insurerDate, inDateRange } from "./claimFilters";

const PAGE_SIZE = 10;
export default function MemberClaimHistory() {
  const [history, setHistory] = useState<ClaimHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(false);
    try {
      const response = await api.get("/member-portal/claims/history", {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setHistory(response.data.data);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);
  const filtered =
    history?.filter(
      (item) =>
        (!status || item.status === status) &&
        inDateRange(insurerDate(item.claimDate), from, through),
    ) ?? [];
  const statuses = [
    ...new Set([...(history ?? []).map((item) => item.status), ...(status ? [status] : [])]),
  ].sort();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;
  return (
    <section className="min-w-0 space-y-5" aria-labelledby="claim-history-heading">
      <Link
        to="/member/claims"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ink underline underline-offset-4"
      >
        Back to My Claims
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id="claim-history-heading" className="text-xl font-bold text-text-strong">
            Claim History
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            Records returned by Claims Portal for your membership. Claims awaiting GNAT review
            remain in{" "}
            <Link to="/member/claims" className="text-ink underline underline-offset-4">
              My Claims
            </Link>
            . Insurer claim numbers are separate from portal references.
          </p>
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh history
        </Button>
      </div>
      {history !== null && history.length > 0 && (
        <div
          role="group"
          aria-label="Filter insurer history"
          className="space-y-3 rounded-xl border border-border-default bg-(--surface-raised) p-4"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label="Insurer status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All insurer statuses</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectField>
            <DateField
              label="Claim date from"
              value={from}
              max={through || undefined}
              onChange={(value) => {
                setFrom(value);
                setPage(1);
              }}
            />
            <DateField
              label="Claim date through"
              value={through}
              min={from || undefined}
              onChange={(value) => {
                setThrough(value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-xs text-text-muted">
              {filtered.length} of {history.length} records
            </p>
            <button
              type="button"
              onClick={() => {
                setStatus("");
                setFrom("");
                setThrough("");
                setPage(1);
              }}
              className="min-h-10 text-xs font-semibold text-ink underline underline-offset-4"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}
      {error && (
        <Alert tone="warning">
          {history === null
            ? "Claims Portal history is unavailable. Please try refreshing history."
            : "Could not refresh history; showing the last loaded results, which may be outdated."}
        </Alert>
      )}
      {loading && (
        <p role="status" className="text-sm text-text-muted">
          {history === null
            ? "Loading Claims Portal claim history…"
            : "Refreshing Claims Portal claim history…"}
        </p>
      )}
      {history !== null &&
        (history.length === 0 ? (
          <p className="rounded-xl border border-border-default bg-(--surface-raised) p-6 text-sm text-text-muted">
            No claims returned by Claims Portal for your membership.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-text-muted">No history records match your filters.</p>
        ) : (
          <div>
            <p className="mb-3 text-xs text-text-muted">
              Amount payable is reported by Claims Portal. Records appear in the order returned by
              Claims Portal.
            </p>
            <TableFrame
              label="Insurer claim history table, scroll horizontally to see all columns"
              className="min-w-200"
            >
              <caption className="sr-only">Claims Portal claim history</caption>
              <thead className="bg-surface-subtle text-xs text-text-muted">
                <tr>
                  {[
                    "No.",
                    "Claim Number",
                    "Name",
                    "Claim Date",
                    "Amount Payable",
                    "Insurer Status",
                  ].map((title) => (
                    <th scope="col" key={title} className="px-4 py-3 font-semibold">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {filtered.slice(offset, offset + PAGE_SIZE).map((item, index) => (
                  <tr key={offset + index} className="align-top">
                    <td className="px-4 py-4 text-text-muted">{offset + index + 1}</td>
                    <th
                      scope="row"
                      className="px-4 py-4 font-mono text-xs font-semibold text-text-strong"
                    >
                      {item.claimNumber}
                    </th>
                    <td className="px-4 py-4">{item.name ?? "Not provided by Claims Portal"}</td>
                    <td className="px-4 py-4">
                      {item.claimDate ?? "Not provided by Claims Portal"}
                    </td>
                    <td className="px-4 py-4">
                      {item.amountPayable != null
                        ? formatCurrency(item.amountPayable)
                        : "Not provided by Claims Portal"}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={claimStatusTone(item.status)}>{item.status}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              totalItems={filtered.length}
              itemLabel="records"
              onPageChange={setPage}
            />
          </div>
        ))}
    </section>
  );
}
