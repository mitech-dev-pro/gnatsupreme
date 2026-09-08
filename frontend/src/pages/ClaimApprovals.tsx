import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import Pagination from "@/components/ui/Pagination";
import ClaimsTable, { type ClaimSubmission } from "@/components/claims/ClaimsTable";

export default function ClaimApprovals() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<ClaimSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = 20;

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/claims/submissions", { signal, params: { page, limit, awaitingReview: "true" } });
      setRows(response.data.data);
      setTotal(response.data.pagination.total);
      setTotalPages(Math.max(1, response.data.pagination.totalPages));
    } catch {
      if (!signal?.aborted) setError("Claims awaiting approval could not be loaded.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return <div>
    <PageHeader title="Claim Approvals" description="Member-filed claims waiting for your review before they're sent to Mankrado." />
    {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
    <ClaimsTable
      rows={rows}
      loading={loading}
      onReviewed={load}
      onError={setError}
      emptyState={<EmptyState title="No claims are waiting for your approval" description="Member-filed claims will appear here until they're approved, returned, or rejected." />}
    />
    <Pagination page={page} totalPages={totalPages} totalItems={total} itemLabel="claims" onPageChange={(nextPage) => { const next = new URLSearchParams(params); next.set("page", String(nextPage)); setParams(next); }} />
  </div>;
}
