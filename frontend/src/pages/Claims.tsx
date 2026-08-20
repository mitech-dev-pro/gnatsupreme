import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import { Alert, EmptyState, TableSkeleton } from "@/components/ui/Feedback";
import { SelectField } from "@/components/ui/FormField";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";

type ClaimSubmission = {
  id: number;
  externalClaimId: string | null;
  provider: string;
  status: string;
  errorMessage: string | null;
  submittedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  member: { id: number; controllerId: string; fullName: string };
  submittedBy: { id: number; fullName: string };
};

type ProviderInfo = {
  provider: string;
  mode: string;
  configured: boolean;
  submissionsEnabled: boolean;
};

const STATUSES = [
  "PENDING",
  "REDIRECT_READY",
  "SUBMITTED",
  "FAILED",
  "SYNCHRONIZED",
];

const STATUS_TONES: Record<string, "info" | "success" | "warning" | "danger"> = {
  PENDING: "warning",
  REDIRECT_READY: "info",
  SUBMITTED: "info",
  FAILED: "danger",
  SYNCHRONIZED: "success",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function Claims() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<ClaimSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/claims/submissions", {
        params: { page, limit, status: status || undefined },
      });
      setRows(res.data.data);
      setTotal(res.data.pagination.total);
      setTotalPages(Math.max(1, res.data.pagination.totalPages));
    } catch {
      setError("Claim submissions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/claims/provider");
        setProvider(res.data.data);
      } catch {
        // provider status is supplementary — a failed fetch shouldn't block the page
      }
    })();
  }, []);

  return (
    <div>
      <PageHeader
        title="Claims"
        description="Claim submissions relayed to the external claims provider on behalf of members."
      />

      {provider && (
        <div className="mb-5 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-[#e5e9f0] bg-white px-4 py-3 text-[12.5px]">
          <span className="font-bold text-[#1e2761]">{provider.provider}</span>
          <span className="text-[#5b6472]">
            · {provider.mode.replace("_", " ").toLowerCase()} integration
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              provider.configured
                ? "bg-[#dff7ee] text-[#17805f]"
                : "bg-[#fbf0dd] text-[#b9791a]"
            }`}
          >
            {provider.configured ? "Configured" : "Not configured"}
          </span>
          {!provider.submissionsEnabled && (
            <span className="text-[#5b6472]">
              New submissions aren't enabled yet — this page shows past claim
              activity only.
            </span>
          )}
        </div>
      )}

      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}

      <div className="mb-4 max-w-52">
        <SelectField
          label="Submission status"
          value={status}
          onChange={(e) =>
            updateParams({ status: e.target.value || null, page: null })
          }
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e5e9f0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-190 text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[#e5e9f0] bg-[#fafbfd] text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
                <th className="px-4 py-2.5">Member</th>
                <th className="px-4 py-2.5">Provider</th>
                <th className="px-4 py-2.5">External Claim ID</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Submitted</th>
                <th className="px-4 py-2.5">Last Synced</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton columns={6} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title="No claim submissions yet"
                      description="Claims submitted for members will appear here with their provider and synchronization status."
                    />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#e5e9f0] last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/members/${row.member.id}`}
                        className="font-semibold text-[#1e2761] hover:underline"
                      >
                        {row.member.fullName}
                      </Link>
                      <div className="text-[11px] text-[#5b6472]">
                        {row.member.controllerId}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[#5b6472]">
                      {row.provider}
                    </td>
                    <td className="px-4 py-2.5 text-[#171b26]">
                      {row.externalClaimId ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={STATUS_TONES[row.status] ?? "info"}>
                        {row.status.replace("_", " ")}
                      </StatusBadge>
                      {row.status === "FAILED" && row.errorMessage && (
                        <div className="mt-0.5 text-[11px] text-[#c23b3b]">
                          {row.errorMessage}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[#5b6472]">
                      {formatDate(row.submittedAt)}
                    </td>
                    <td className="px-4 py-2.5 text-[#5b6472]">
                      {formatDate(row.lastSyncedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
