import { Fragment, useCallback, useEffect, useState } from "react";
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

type ClaimSubmission = { id: number; externalClaimId: string | null; provider: string; status: string; source: "STAFF" | "MEMBER_PORTAL"; claimType: string | null; claimantName: string | null; estimatedAmount: string | null; errorMessage: string | null; reviewNote: string | null; submittedAt: string | null; member: { id: number; controllerId: string; fullName: string }; submittedByMember: { id: number; controllerId: string; fullName: string } | null };
type Decision = "APPROVE" | "RETURN" | "REJECT";
const STATUSES = ["PENDING", "REDIRECT_READY", "SUBMITTED", "RETURNED", "FAILED", "SYNCHRONIZED"];
const STATUS_TONES: Record<string, "info" | "success" | "warning" | "danger"> = { PENDING: "warning", REDIRECT_READY: "info", SUBMITTED: "info", RETURNED: "warning", FAILED: "danger", SYNCHRONIZED: "success" };
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
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
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

  const startReview = (row: ClaimSubmission) => { setReviewingId(row.id); setDecision(null); setReviewNote(""); setError(""); };
  const submitReview = async () => {
    if (!reviewingId || !decision) return;
    if (decision !== "APPROVE" && !reviewNote.trim()) { setError("A review note is required when returning or rejecting a claim."); return; }
    setReviewBusy(true); setError("");
    try {
      await api.patch(`/claims/submissions/${reviewingId}/review`, { action: decision, note: reviewNote.trim() || null });
      setReviewingId(null); setDecision(null); setReviewNote("");
      await load();
    } catch (caught: any) {
      setError(caught?.response?.data?.message || "The review could not be completed.");
    } finally {
      setReviewBusy(false);
    }
  };

  return <div>
    <PageHeader title="Claims" description="Create and track member claim submissions." actions={<Button onClick={() => navigate("/claims/new")}>File a claim</Button>}/>
    {success && <div className="mb-5"><Alert tone="success">{success}</Alert></div>}
    {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
    <div className="mb-4 max-w-52"><label className="mb-1.5 block text-[11.5px] font-bold text-(--text-strong)">Submission status</label><Dropdown value={status} onChange={(value) => updateParams({ status: value || null, page: null })} options={[{ value: "", label: "All statuses" }, ...STATUSES.map((item) => ({ value: item, label: labelize(item) }))]}/></div>
    <TableFrame label="Claim submissions" className="min-w-210"><thead><tr className="border-b border-(--border-default) bg-(--surface-subtle) text-[11px] font-semibold uppercase tracking-wide text-(--text-muted)"><th className="px-4 py-2.5">Member</th><th className="px-4 py-2.5">Claim</th><th className="px-4 py-2.5">Reference</th><th className="px-4 py-2.5">Estimate</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Submitted</th><th className="px-4 py-2.5">Action</th></tr></thead><tbody>{loading && rows.length === 0 ? <TableSkeleton columns={7}/> : rows.length === 0 ? <tr><td colSpan={7}><EmptyState title="No claim submissions yet" description="File the first claim to begin tracking its details and processing status." action={<Button onClick={() => navigate("/claims/new")}>File a claim</Button>}/></td></tr> : rows.map((row) => <Fragment key={row.id}>
      <tr className="border-b border-(--border-default) last:border-0">
        <td className="px-4 py-2.5"><Link to={`/members/${row.member.id}`} className="font-semibold text-(--text-strong) hover:underline">{row.member.fullName}</Link><div className="text-[11px] text-(--text-muted)">{row.member.controllerId}</div></td>
        <td className="px-4 py-2.5"><div className="font-semibold text-(--ink)">{labelize(row.claimType)}</div>{row.claimantName && <div className="text-[11px] text-(--text-muted)">{row.claimantName}</div>}{row.source === "MEMBER_PORTAL" && <div className="mt-0.5 inline-block rounded-full bg-(--info-soft) px-2 py-0.5 text-[10px] font-bold text-(--text-strong)">Filed by member</div>}</td>
        <td className="px-4 py-2.5"><div className="font-mono text-[11.5px] text-(--ink)">{row.externalClaimId ?? "Not assigned"}</div><div className="text-[10.5px] text-(--text-muted)">{row.provider}</div></td>
        <td className="px-4 py-2.5 font-semibold text-(--ink)">{row.estimatedAmount ? formatCurrency(row.estimatedAmount) : "Not available"}</td>
        <td className="px-4 py-2.5"><StatusBadge tone={STATUS_TONES[row.status] ?? "info"}>{labelize(row.status)}</StatusBadge>{row.status === "FAILED" && row.errorMessage && <div className="mt-0.5 text-[11px] text-(--danger)">{row.errorMessage}</div>}{row.status === "RETURNED" && row.reviewNote && <div className="mt-0.5 text-[11px] text-(--warning)">{row.reviewNote}</div>}</td>
        <td className="px-4 py-2.5 text-(--text-muted)">{formatDate(row.submittedAt)}</td>
        <td className="px-4 py-2.5">{row.status === "PENDING" && row.source === "MEMBER_PORTAL" && <button type="button" onClick={() => startReview(row)} className="rounded-[7px] border border-(--action-primary) px-2.5 py-1 text-[11px] font-bold text-(--action-primary) hover:bg-(--info-soft)">Review</button>}</td>
      </tr>
      {reviewingId === row.id && <tr className="border-b border-(--border-default) bg-(--surface-subtle)"><td colSpan={7} className="px-4 py-4">
        <div className="max-w-160">
          <p className="mb-2 text-[12px] font-bold text-(--text-strong)">Review this member-submitted claim</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={decision === "APPROVE"} onClick={() => setDecision("APPROVE")} className={`rounded-[7px] border px-3 py-1.5 text-[11.5px] font-bold ${decision === "APPROVE" ? "border-(--success) bg-(--success-soft) text-(--success)" : "border-(--border-default) text-(--ink)"}`}>Approve</button>
            <button type="button" aria-pressed={decision === "RETURN"} onClick={() => setDecision("RETURN")} className={`rounded-[7px] border px-3 py-1.5 text-[11.5px] font-bold ${decision === "RETURN" ? "border-(--warning) bg-(--warning-soft) text-(--warning)" : "border-(--border-default) text-(--ink)"}`}>Return for correction</button>
            <button type="button" aria-pressed={decision === "REJECT"} onClick={() => setDecision("REJECT")} className={`rounded-[7px] border px-3 py-1.5 text-[11.5px] font-bold ${decision === "REJECT" ? "border-(--danger) bg-(--danger-soft) text-(--danger)" : "border-(--border-default) text-(--ink)"}`}>Reject</button>
          </div>
          {decision && <div className="mt-3">
            <label className="mb-1 block text-[11px] font-bold text-(--text-strong)">Review note {decision === "APPROVE" ? <span className="font-normal text-(--text-muted)">Optional</span> : <span className="text-(--danger)">Required</span>}</label>
            <textarea rows={2} maxLength={500} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="w-full rounded-[9px] border border-(--border-default) bg-(--surface-raised) px-3 py-2 text-[12px]" placeholder={decision === "APPROVE" ? "Add a note if needed" : "Explain the decision and what the member should do next"}/>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setReviewingId(null)}>Cancel</Button>
              <Button size="sm" loading={reviewBusy} loadingLabel="Saving…" disabled={decision !== "APPROVE" && !reviewNote.trim()} onClick={() => void submitReview()}>Confirm {decision.toLowerCase()}</Button>
            </div>
          </div>}
        </div>
      </td></tr>}
    </Fragment>)}</tbody></TableFrame>
    <Pagination page={page} totalPages={totalPages} totalItems={total} itemLabel="submissions" onPageChange={(nextPage) => updateParams({ page: String(nextPage) })}/>
  </div>;
}
