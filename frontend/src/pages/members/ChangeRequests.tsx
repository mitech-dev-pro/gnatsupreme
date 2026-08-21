import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import "./ChangeRequests.css";

type RequestItem = { id: number; type: string; status: string; proposedData: Record<string, unknown> | null; targetBeneficiaryId: number | null; requestNote: string | null; reviewNote: string | null; requestedAt: string; reviewedAt: string | null; member: { id: number; controllerId: string; fullName: string; status: string }; requestedBy: { id: number; fullName: string } | null; reviewedBy: { id: number; fullName: string } | null };
type MemberData = { id: number; fullName: string; dateOfBirth: string | null; ghanaCardId: string | null; phone: string | null; school: string; spouse: Record<string, unknown> | null; beneficiaries: Array<Record<string, unknown> & { id: number; fullName: string }> };
type Decision = "APPROVE" | "RETURN" | "REJECT";

const TYPES = ["MEMBER_DETAILS", "SPOUSE", "BENEFICIARY_ADD", "BENEFICIARY_UPDATE", "BENEFICIARY_REMOVE"];
const STATUSES = ["PENDING", "APPROVED", "RETURNED", "REJECTED", "CANCELLED"];
const REVIEW_ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN", "DISTRICT_ADMIN"];
const labels: Record<string, string> = { MEMBER_DETAILS: "Member details", SPOUSE: "Spouse details", BENEFICIARY_ADD: "Add beneficiary", BENEFICIARY_UPDATE: "Update beneficiary", BENEFICIARY_REMOVE: "Remove beneficiary", fullName: "Full name", dateOfBirth: "Date of birth", ghanaCardId: "Ghana Card ID", phone: "Phone", school: "School", relationship: "Relationship", trusteeName: "Trustee name", trusteeGhanaCardId: "Trustee Ghana Card ID" };
const pretty = (value: unknown) => value === null || value === undefined || value === "" ? "Not provided" : typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : String(value).replaceAll("_", " ");
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const statusTone = (status: string): "neutral" | "success" | "warning" | "danger" => status === "APPROVED" ? "success" : status === "PENDING" || status === "RETURNED" ? "warning" : status === "CANCELLED" ? "neutral" : "danger";

export default function ChangeRequests() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "PENDING";
  const type = params.get("type") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [selected, setSelected] = useState<RequestItem | null>(null);
  const [member, setMember] = useState<MemberData | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const canReview = Boolean(user && REVIEW_ROLES.includes(user.role));

  const updateParams = (values: Record<string, string | null>) => { const next = new URLSearchParams(params); Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); setParams(next); };
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await api.get("/change-requests", { params: { page, limit: 20, status: status || undefined, type: type || undefined } }); const next = response.data.data as RequestItem[]; setItems(next); setTotal(response.data.pagination.total); setTotalPages(Math.max(1, response.data.pagination.totalPages)); setSelected((current) => next.find((item) => item.id === current?.id) ?? next[0] ?? null); }
    catch { setError("Change requests could not be loaded."); }
    finally { setLoading(false); }
  }, [page, status, type]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!selected) { setMember(null); return; } let cancelled = false; setDetailLoading(true); api.get(`/members/${selected.member.id}`).then((response) => { if (!cancelled) setMember(response.data.data); }).catch(() => { if (!cancelled) setMember(null); }).finally(() => { if (!cancelled) setDetailLoading(false); }); return () => { cancelled = true; }; }, [selected]);

  const currentSource = () => {
    if (!member || !selected) return {};
    if (selected.type === "MEMBER_DETAILS") return member as unknown as Record<string, unknown>;
    if (selected.type === "SPOUSE") return member.spouse ?? {};
    if (selected.type.includes("BENEFICIARY") && selected.targetBeneficiaryId) return member.beneficiaries.find((item) => item.id === selected.targetBeneficiaryId) ?? {};
    return {};
  };
  const source = currentSource();
  const proposed = selected?.proposedData ?? {};
  const compareKeys = (selected?.type === "BENEFICIARY_REMOVE" ? Object.keys(source) : Object.keys(proposed)).filter((key) => !["id", "memberId", "createdAt", "updatedAt"].includes(key));

  const review = async () => {
    if (!selected || !decision) return;
    if (decision !== "APPROVE" && !reviewNote.trim()) { setError("A review note is required when returning or rejecting a request."); return; }
    setBusy(true); setError("");
    try { await api.patch(`/change-requests/${selected.id}/review`, { action: decision, note: reviewNote.trim() || null }); setDecision(null); setReviewNote(""); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || "The review could not be completed."); }
    finally { setBusy(false); }
  };

  return <main className="change-page">
    <PageHeader eyebrow="Member administration" title="Change requests" description={`${total.toLocaleString()} ${status ? status.toLowerCase() : "matching"} request${total === 1 ? "" : "s"} in your access scope`} />
    <div className="change-filters" aria-label="Change request filters"><select aria-label="Filter by status" value={status} onChange={(event) => updateParams({ status: event.target.value || null, page: null })}><option value="">All statuses</option>{STATUSES.map((item) => <option key={item} value={item}>{item.charAt(0) + item.slice(1).toLowerCase()}</option>)}</select><select aria-label="Filter by request type" value={type} onChange={(event) => updateParams({ type: event.target.value || null, page: null })}><option value="">All request types</option>{TYPES.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select></div>
    {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
    <div className="change-workspace">
      <section className="change-queue" aria-labelledby="request-queue-heading">
        <div className="change-queue__title"><h2 id="request-queue-heading">Requests</h2><span aria-label={`${total} requests`}>{total}</span></div>
        {loading ? <div className="change-skeleton" aria-label="Loading requests">{Array.from({ length: 5 }).map((_, index) => <span key={index}/>)}</div> : items.length === 0 ? <EmptyState title="No requests found" description="Requests matching these filters will appear here." /> : <ul>{items.map((item) => <li key={item.id}><button type="button" aria-pressed={selected?.id === item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => { setSelected(item); setDecision(null); setReviewNote(""); }}><span className="change-type">{labels[item.type]}</span><strong>{item.member.fullName}</strong><small>{item.member.controllerId} · Requested {date(item.requestedAt)}</small><StatusBadge tone={statusTone(item.status)}>{item.status.charAt(0) + item.status.slice(1).toLowerCase()}</StatusBadge></button></li>)}</ul>}
        {totalPages > 1 && <div className="px-3 pb-3"><Pagination page={page} totalPages={totalPages} totalItems={total} itemLabel="requests" onPageChange={(nextPage) => updateParams({ page: String(nextPage) })} /></div>}
      </section>

      <section className="change-detail" aria-live="polite">
        {!selected ? <div className="change-empty"><strong>Select a request</strong><p>Choose a request to inspect its proposed changes.</p></div> : detailLoading ? <div className="change-detail-skeleton" aria-label="Loading request details"><span/><span/><span/></div> : <>
          <header><div><span>{labels[selected.type]}</span><h2>{selected.member.fullName}</h2><p>{selected.requestedBy ? `Requested by ${selected.requestedBy.fullName}` : "Requested through member access"} on {date(selected.requestedAt)}</p></div><Link to={`/members/${selected.member.id}`}>View member profile</Link></header>
          {selected.requestNote && <div className="change-request-note"><span>Request note</span><p>{selected.requestNote}</p></div>}
          <div className="change-comparison"><div className="change-comparison__heading"><h3>{selected.type === "BENEFICIARY_REMOVE" ? "Record to remove" : "Proposed changes"}</h3><span>Current value</span><span>Requested value</span></div>{compareKeys.length === 0 ? <p className="change-no-data">No field data accompanies this request.</p> : compareKeys.map((key) => { const before = source[key]; const after = selected.type === "BENEFICIARY_REMOVE" ? null : proposed[key]; const changed = pretty(before) !== pretty(after); return <div className={`change-row ${changed ? "is-changed" : ""}`} key={key}><strong>{labels[key] ?? key.replaceAll("_", " ")}</strong><span data-label="Current value">{pretty(before)}</span><span data-label="Requested value">{selected.type === "BENEFICIARY_REMOVE" ? "Will be removed" : pretty(after)}</span></div>; })}</div>
          {selected.status === "PENDING" && canReview ? <div className="change-review"><h3>Review decision</h3><p className="change-review__help">Approval updates the member record immediately. Return and reject decisions require a note that the member can read.</p><div className="change-decisions"><button type="button" aria-pressed={decision === "APPROVE"} className={decision === "APPROVE" ? "approve active" : "approve"} onClick={() => setDecision("APPROVE")}>Approve</button><button type="button" aria-pressed={decision === "RETURN"} className={decision === "RETURN" ? "return active" : "return"} onClick={() => setDecision("RETURN")}>Return for correction</button><button type="button" aria-pressed={decision === "REJECT"} className={decision === "REJECT" ? "reject active" : "reject"} onClick={() => setDecision("REJECT")}>Reject</button></div>{decision && <div className="change-note"><label htmlFor="change-review-note">Review note {decision === "APPROVE" ? <small>Optional</small> : <small>Required</small>}</label><textarea id="change-review-note" rows={3} maxLength={500} required={decision !== "APPROVE"} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder={decision === "APPROVE" ? "Add a note if needed" : "Explain the decision and what the member should do next"}/><div><span aria-live="polite">{reviewNote.length}/500</span><button type="button" disabled={busy || (decision !== "APPROVE" && !reviewNote.trim())} onClick={() => void review()}>{busy ? "Saving…" : `Confirm ${decision.toLowerCase()}`}</button></div></div>}</div> : selected.status !== "PENDING" ? <div className="change-reviewed"><strong>{selected.status.charAt(0) + selected.status.slice(1).toLowerCase()}</strong><p>{selected.reviewNote || "No review note was recorded."}</p><span>{selected.reviewedBy ? `Reviewed by ${selected.reviewedBy.fullName}` : "Review completed"}{selected.reviewedAt ? ` on ${date(selected.reviewedAt)}` : ""}</span></div> : <div className="change-reviewed"><strong>Review access required</strong><p>Your role can view this request but cannot decide it.</p></div>}
        </>}
      </section>
    </div>
  </main>;
}
