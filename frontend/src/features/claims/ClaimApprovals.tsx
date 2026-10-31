import ClaimsPortalStatus from "@/components/claims/ClaimsPortalStatus";
import ClaimsTable, { type ClaimSubmission } from "@/components/claims/ClaimsTable";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import api from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

export default function ClaimApprovals() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<ClaimSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const rawPage = Number(params.get("page"));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = 10;
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const signal = controller.signal;
    setLoading(true);
    setRows([]);
    setError("");
    try {
      const response = await api.get("/claims/submissions", {
        signal,
        params: { page, limit, awaitingReview: "true" },
      });
      if (signal.aborted) return;
      const pages = Math.max(1, response.data.pagination.totalPages);
      if (page > pages) {
        setParams(
          (previous) => {
            const next = new URLSearchParams(previous);
            next.set("page", String(pages));
            return next;
          },
          { replace: true },
        );
        return;
      }
      setRows(response.data.data);
      setTotal(response.data.pagination.total);
      setTotalPages(Math.max(1, response.data.pagination.totalPages));
    } catch {
      if (!signal?.aborted) setError("Claims awaiting approval could not be loaded.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, setParams]);

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Claim Approvals"
        description="Member-filed claims waiting for your review before they're sent to Claims Portal."
        actions={<ClaimsPortalStatus />}
      />
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <ClaimsTable
        rows={rows}
        loading={loading}
        rowOffset={(page - 1) * limit}
        reviewActions
        onReviewed={load}
        onError={setError}
        emptyState={
          error ? (
            <div className="p-6 text-sm text-text-muted">
              Approvals could not be loaded.{" "}
              <button
                type="button"
                onClick={() => void load()}
                className="font-semibold text-ink underline"
              >
                Try again
              </button>
            </div>
          ) : (
            <EmptyState
              title="No claims are waiting for your approval"
              description="Member-filed claims will appear here until they're approved, returned, or rejected."
            />
          )
        }
      />
      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={total}
        itemLabel="claims"
        onPageChange={(nextPage) => {
          const next = new URLSearchParams(params);
          next.set("page", String(nextPage));
          setParams(next);
        }}
      />
    </div>
  );
}
