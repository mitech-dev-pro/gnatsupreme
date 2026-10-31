import type { ClaimSubmission } from "@/components/claims/ClaimsTable";
import api from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

const LIMIT = 10;

// Shared by Claims and ClaimApprovals -- both paginate the same /claims/submissions endpoint
// with the same abort-on-navigation/loading/error bookkeeping, differing only in which query
// filters they fix (status/deliveryState vs. awaitingReview=true).
export function useClaimSubmissionsList(filters: Record<string, string | undefined>) {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get("page"));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const [rows, setRows] = useState<ClaimSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const filtersKey = JSON.stringify(filters);

  const load = useCallback(
    async () => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const signal = controller.signal;
      setLoading(true);
      setError("");
      try {
        const response = await api.get("/claims/submissions", {
          signal,
          params: { page, limit: LIMIT, ...filters },
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
        if (!signal.aborted) setError("Claim submissions could not be loaded.");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    // filtersKey stands in for filters -- a fresh object literal each render would otherwise
    // recreate `load` (and retrigger the effect below) every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, filtersKey, setParams],
  );

  useEffect(() => {
    setRows([]);
    void load();
    return () => request.current?.abort();
  }, [load]);

  const updateParams = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    setParams(next);
  };

  return {
    params,
    page,
    limit: LIMIT,
    rows,
    total,
    totalPages,
    loading,
    error,
    setError,
    load,
    updateParams,
  };
}
