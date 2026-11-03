import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";

type Pagination = { total: number; totalPages: number };
type PaginatedResponse<T> = { data: T[]; pagination: Pagination };

// Factors out the page/URL-synced, abort-on-reload, loading/error/page-overflow-redirect
// boilerplate that was independently reimplemented across several list pages (Claims,
// ClaimApprovals, and others) with the same shape and the same subtle bugs to get right --
// aborting the in-flight request on every reload, redirecting off a page that no longer exists
// once filters shrink the result set, and not setting error/loading state after an abort. Pages
// with extra per-row state (selection, a preview pane) layer that on top via their own
// useEffect(load the hook's rows) rather than this hook growing to know about it.
export function usePaginatedList<T>(
  path: string,
  filters: Record<string, string | number | boolean | undefined>,
  options: { limit?: number; errorMessage?: string } = {},
) {
  const limit = options.limit ?? 20;
  const errorMessage = options.errorMessage ?? "The list could not be loaded.";
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get("page"));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const [rows, setRows] = useState<T[]>([]);
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
      setLoading(true);
      setError("");
      try {
        const response = await api.get<PaginatedResponse<T>>(path, {
          signal: controller.signal,
          params: { page, limit, ...filters },
        });
        if (controller.signal.aborted) return;
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
        setTotalPages(pages);
      } catch {
        if (!controller.signal.aborted) {
          setRows([]);
          setError(errorMessage);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    // filtersKey stands in for filters -- a fresh object literal each render would otherwise
    // recreate `load` (and retrigger the effect below) every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, page, limit, filtersKey, errorMessage, setParams],
  );

  useEffect(() => {
    // Cleared here, not inside load() itself -- a manual retry (the error banner's "Try again")
    // calls load() directly and should keep showing the previous page's rows underneath the
    // loading state rather than flashing to empty.
    setRows([]);
    void load();
    return () => request.current?.abort();
  }, [load]);

  const updateParams = useCallback(
    (values: Record<string, string | null>) => {
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(values).forEach(([key, value]) =>
          value ? next.set(key, value) : next.delete(key),
        );
        return next;
      });
    },
    [setParams],
  );

  return {
    params,
    page,
    limit,
    rows,
    setRows,
    total,
    totalPages,
    loading,
    error,
    setError,
    load,
    updateParams,
  };
}
