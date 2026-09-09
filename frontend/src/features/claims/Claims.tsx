import ClaimsTable, { type ClaimSubmission } from "@/components/claims/ClaimsTable";
import Button from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import api from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

const STATUSES = ["PENDING", "REDIRECT_READY", "SUBMITTED", "RETURNED", "FAILED", "SYNCHRONIZED"];
const labelize = (value: string | null) =>
  value
    ? value
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase())
    : "Not recorded";

export default function Claims() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<ClaimSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success] = useState((location.state as { success?: string } | null)?.success ?? "");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const status = params.get("status") ?? "";
  const limit = 20;
  const updateParams = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    setParams(next);
  };
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const response = await api.get("/claims/submissions", {
          signal,
          params: { page, limit, status: status || undefined },
        });
        setRows(response.data.data);
        setTotal(response.data.pagination.total);
        setTotalPages(Math.max(1, response.data.pagination.totalPages));
      } catch {
        if (!signal?.aborted) setError("Claim submissions could not be loaded.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page, status],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (success) {
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      });
    }
  }, [location.pathname, location.search, navigate, success]);

  return (
    <div>
      <PageHeader
        title="Claims"
        description="Create and track member claim submissions."
        actions={<Button onClick={() => navigate("/claims/new")}>File a claim</Button>}
      />
      {success && (
        <div className="mb-5">
          <Alert tone="success">{success}</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="mb-4 max-w-52">
        <label className="mb-1.5 block text-xs font-bold text-text-strong">Submission status</label>
        <Dropdown
          value={status}
          onChange={(value) => updateParams({ status: value || null, page: null })}
          options={[
            { value: "", label: "All statuses" },
            ...STATUSES.map((item) => ({ value: item, label: labelize(item) })),
          ]}
        />
      </div>
      <ClaimsTable
        rows={rows}
        loading={loading}
        onReviewed={load}
        onError={setError}
        emptyState={
          <EmptyState
            title="No claim submissions yet"
            description="File the first claim to begin tracking its details and processing status."
            action={<Button onClick={() => navigate("/claims/new")}>File a claim</Button>}
          />
        }
      />
      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={total}
        itemLabel="submissions"
        onPageChange={(nextPage) => updateParams({ page: String(nextPage) })}
      />
    </div>
  );
}
