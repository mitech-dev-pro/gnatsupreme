import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import PageHeader from "@/components/ui/PageHeader";
import Dropdown from "@/components/ui/Dropdown";
import Button from "@/components/ui/Button";
import { Alert, EmptyState, TableSkeleton } from "@/components/ui/Feedback";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import TableFrame from "@/components/ui/TableFrame";

type ClaimSubmission = { id: number; externalClaimId: string | null; provider: string; status: string; claimType: string | null; claimantName: string | null; estimatedAmount: string | null; errorMessage: string | null; submittedAt: string | null; member: { id: number; controllerId: string; fullName: string } };
const STATUSES = ["PENDING", "REDIRECT_READY", "SUBMITTED", "FAILED", "SYNCHRONIZED"];
const STATUS_TONES: Record<string, "info" | "success" | "warning" | "danger"> = { PENDING: "warning", REDIRECT_READY: "info", SUBMITTED: "info", FAILED: "danger", SYNCHRONIZED: "success" };
const labelize = (value: string | null) => value ? value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()) : "Not recorded";
const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Not recorded";

export default function Claims() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<ClaimSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success] = useState(
    (location.state as { success?: string } | null)?.success ?? "",
  );
  const page = Math.max(1, Number(params.get("page")) || 1);
  const status = params.get("status") ?? "";
  const limit = 20;
  const updateParams = (values: Record<string, string | null>) => { const next = new URLSearchParams(params); Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); setParams(next); };
  const load = useCallback(async (signal?: AbortSignal) => { setLoading(true); setError(""); try { const response = await api.get("/claims/submissions", { signal, params: { page, limit, status: status || undefined } }); setRows(response.data.data); setTotal(response.data.pagination.total); setTotalPages(Math.max(1, response.data.pagination.totalPages)); } catch { if (!signal?.aborted) setError("Claim submissions could not be loaded."); } finally { if (!signal?.aborted) setLoading(false); } }, [page, status]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => {
    if (success) {
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      });
    }
  }, [location.pathname, location.search, navigate, success]);

  return <div>
    <PageHeader title="Claims" description="Create and track member claim submissions." actions={<Button onClick={() => navigate("/claims/new")}>File a claim</Button>}/>
    {success && <div className="mb-5"><Alert tone="success">{success}</Alert></div>}
    {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
    <div className="mb-4 max-w-52"><label className="mb-1.5 block text-[11.5px] font-bold text-(--text-strong)">Submission status</label><Dropdown value={status} onChange={(value) => updateParams({ status: value || null, page: null })} options={[{ value: "", label: "All statuses" }, ...STATUSES.map((item) => ({ value: item, label: labelize(item) }))]}/></div>
    <TableFrame label="Claim submissions" className="min-w-210"><thead><tr className="border-b border-(--border-default) bg-(--surface-subtle) text-[11px] font-semibold uppercase tracking-wide text-(--text-muted)"><th className="px-4 py-2.5">Member</th><th className="px-4 py-2.5">Claim</th><th className="px-4 py-2.5">Reference</th><th className="px-4 py-2.5">Estimate</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Submitted</th></tr></thead><tbody>{loading && rows.length === 0 ? <TableSkeleton columns={6}/> : rows.length === 0 ? <tr><td colSpan={6}><EmptyState title="No claim submissions yet" description="File the first claim to begin tracking its details and processing status." action={<Button onClick={() => navigate("/claims/new")}>File a claim</Button>}/></td></tr> : rows.map((row) => <tr key={row.id} className="border-b border-(--border-default) last:border-0"><td className="px-4 py-2.5"><Link to={`/members/${row.member.id}`} className="font-semibold text-(--text-strong) hover:underline">{row.member.fullName}</Link><div className="text-[11px] text-(--text-muted)">{row.member.controllerId}</div></td><td className="px-4 py-2.5"><div className="font-semibold text-(--ink)">{labelize(row.claimType)}</div>{row.claimantName && <div className="text-[11px] text-(--text-muted)">{row.claimantName}</div>}</td><td className="px-4 py-2.5"><div className="font-mono text-[11.5px] text-(--ink)">{row.externalClaimId ?? "Not assigned"}</div><div className="text-[10.5px] text-(--text-muted)">{row.provider}</div></td><td className="px-4 py-2.5 font-semibold text-(--ink)">{row.estimatedAmount ? formatCurrency(row.estimatedAmount) : "Not available"}</td><td className="px-4 py-2.5"><StatusBadge tone={STATUS_TONES[row.status] ?? "info"}>{labelize(row.status)}</StatusBadge>{row.status === "FAILED" && row.errorMessage && <div className="mt-0.5 text-[11px] text-(--danger)">{row.errorMessage}</div>}</td><td className="px-4 py-2.5 text-(--text-muted)">{formatDate(row.submittedAt)}</td></tr>)}</tbody></TableFrame>
    <Pagination page={page} totalPages={totalPages} totalItems={total} itemLabel="submissions" onPageChange={(nextPage) => updateParams({ page: String(nextPage) })}/>
  </div>;
}
