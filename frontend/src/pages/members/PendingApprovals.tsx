import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import "./PendingApprovals.css";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import Dropdown from "@/components/ui/Dropdown";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";

type Member = { id: number; controllerId: string; fullName: string; dateOfBirth: string | null; ghanaCardId: string | null; phone: string | null; phoneVerifiedAt: string | null; school: string; report20Matched: boolean; createdAt: string; district: { id: number; name: string; region: { id: number; name: string } } | null; spouse: unknown | null; _count: { beneficiaries: number }; createdBy: { id: number; fullName: string } | null };
type BulkResult = { requested: number; succeeded: number; failed: number; results: Array<{ memberId: number; success: boolean; memberName?: string; status?: string; message?: string }> };

function Signal({ good, yes, no }: { good: boolean; yes: string; no: string }) { return <span className={`approval-signal ${good ? "good" : "warn"}`}><i>{good ? "✓" : "!"}</i>{good ? yes : no}</span>; }

export default function PendingApprovals() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = [5, 10, 20].includes(Number(params.get("limit"))) ? Number(params.get("limit")) : 10;
  const search = params.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(search);
  const [rows, setRows] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [preview, setPreview] = useState<Member | null>(null);
  const [returning, setReturning] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const [result, setResult] = useState<BulkResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approvalIds, setApprovalIds] = useState<number[]>([]);

  const updateParams = (values: Record<string, string | null>) => { const next = new URLSearchParams(params); Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); setParams(next); };
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await api.get("/members", { params: { status: "PENDING", page, limit, search: search || undefined } }); setRows(response.data.data); setTotal(response.data.pagination.total); setTotalPages(Math.max(1, response.data.pagination.totalPages)); setSelected((current) => current.filter((id) => response.data.data.some((item: Member) => item.id === id))); setPreview((current) => response.data.data.find((item: Member) => item.id === current?.id) ?? null); }
    catch { setError("Pending members could not be loaded."); }
    finally { setLoading(false); }
  }, [limit, page, search]);

  useEffect(() => { void load(); }, [load]);
  const allSelected = rows.length > 0 && rows.every((item) => selected.includes(item.id));
  const toggleAll = () => setSelected(allSelected ? [] : rows.map((item) => item.id));
  const toggle = (id: number) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const submitSearch = (event: FormEvent) => { event.preventDefault(); updateParams({ search: searchInput.trim() || null, page: null }); };

  const bulkApprove = async (memberIds = selected) => {
    if (!memberIds.length) return;
    if (approvalIds.length !== memberIds.length || memberIds.some((memberId) => !approvalIds.includes(memberId))) {
      setApprovalIds(memberIds);
      return;
    }
    setBusy(true); setError(""); setResult(null);
    try { const response = await api.post("/members/bulk/approve", { memberIds }); setResult(response.data.data); setSelected([]); setPreview(null); setApprovalIds([]); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || "The selected members could not be approved."); }
    finally { setBusy(false); }
  };

  const bulkReturn = async () => {
    if (!selected.length || !returnNote.trim()) return;
    setBusy(true); setError(""); setResult(null);
    try { const response = await api.post("/members/bulk/return", { memberIds: selected, note: returnNote.trim() }); setResult(response.data.data); setSelected([]); setReturning(false); setReturnNote(""); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || "The selected members could not be returned."); }
    finally { setBusy(false); }
  };

  return <main className="approvals-page">
    <PageHeader eyebrow="Member administration" title="Pending approvals" description={`${total.toLocaleString()} member${total === 1 ? "" : "s"} waiting for review`} actions={<div className="approvals-key"><Signal good yes="Ready" no="Needs attention"/><Signal good={false} yes="" no="Review required"/></div>} />
    <div className="approvals-toolbar"><form onSubmit={submitSearch}><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search pending members"/><button>Search</button></form><label>Show <Dropdown className="w-[74px]" value={limit} onChange={(value) => updateParams({ limit: value, page: null })} options={[5,10,20].map((size) => ({ value: size, label: String(size) }))}/></label></div>
    {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
    {result && <div className="mb-3"><Alert tone={result.failed ? "warning" : "success"}><strong>{result.succeeded} of {result.requested} completed.</strong> {result.failed ? `${result.failed} member${result.failed === 1 ? "" : "s"} could not be processed.` : "All selected members were processed successfully."}{result.failed > 0 && <ul className="mt-2 list-disc pl-5">{result.results.filter((item) => !item.success).map((item) => <li key={item.memberId}>{item.memberName || `Member ${item.memberId}`}: {item.message}</li>)}</ul>}<button className="ml-2 underline" onClick={() => setResult(null)}>Dismiss</button></Alert></div>}

    {selected.length > 0 && <section className="approvals-selection"><div><strong>{selected.length}</strong><span>selected</span></div><button disabled={busy} className="approve" onClick={() => setApprovalIds(selected)}>Approve selected</button><button disabled={busy} className="return" onClick={() => setReturning(true)}>Return selected</button><button className="clear" onClick={() => setSelected([])}>Clear</button></section>}
    {approvalIds.length > 0 && <ConfirmationPanel title={`Approve ${approvalIds.length} member${approvalIds.length === 1 ? "" : "s"}?`} description="Members matched in Report 20 will become Active. Unmatched members will become Flagged for follow-up." confirmLabel="Approve members" busyLabel="Approving…" tone="warning" confirmVariant="primary" busy={busy} onConfirm={() => void bulkApprove(approvalIds)} onCancel={() => setApprovalIds([])} />}
    {returning && <section className="approvals-return"><div><h2>Return {selected.length} member{selected.length === 1 ? "" : "s"} for correction</h2><p>The same note will be sent to every selected member.</p></div><textarea autoFocus rows={3} maxLength={500} value={returnNote} onChange={(event) => setReturnNote(event.target.value)} placeholder="Explain what must be corrected"/><footer><span>{returnNote.length}/500</span><button onClick={() => { setReturning(false); setReturnNote(""); }}>Cancel</button><button disabled={busy || returnNote.trim().length < 2} onClick={() => void bulkReturn()}>{busy ? "Returning…" : "Confirm return"}</button></footer></section>}

    <div className={`approvals-layout ${preview ? "has-preview" : ""}`}>
      <section className="approvals-table-shell">
        {loading ? <div className="approvals-skeleton">{Array.from({ length: limit }).map((_, index) => <span key={index}/>)}</div> : rows.length === 0 ? <EmptyState title="No pending approvals" description="New enrollments awaiting review will appear here." action={<Link to="/members">View all members</Link>} /> : <div className="approvals-table-wrap"><table><thead><tr><th><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all on this page"/></th><th>Member</th><th>Location</th><th>Eligibility signals</th><th>Covered lives</th><th>Review</th></tr></thead><tbody>{rows.map((member) => { const identityComplete = Boolean(member.dateOfBirth && member.ghanaCardId); return <tr key={member.id} className={selected.includes(member.id) ? "selected" : ""}><td><input type="checkbox" checked={selected.includes(member.id)} onChange={() => toggle(member.id)} aria-label={`Select ${member.fullName}`}/></td><td><Link to={`/members/${member.id}`}><strong>{member.fullName}</strong><span>{member.controllerId} · {member.school}</span></Link></td><td>{member.district ? <><strong>{member.district.name}</strong><span>{member.district.region.name}</span></> : <strong style={{ color: "#b9791a" }}>No district</strong>}</td><td><div className="approval-signals"><Signal good={member.report20Matched} yes="Report 20 matched" no="Report 20 unmatched"/><Signal good={Boolean(member.phoneVerifiedAt)} yes="Phone verified" no="Phone unverified"/><Signal good={identityComplete} yes="Identity complete" no="Identity incomplete"/></div></td><td><strong>{member._count.beneficiaries} beneficiar{member._count.beneficiaries === 1 ? "y" : "ies"}</strong><span>{member.spouse ? "Spouse recorded" : "No spouse"}</span></td><td><button className="approval-review-button" onClick={() => setPreview(member)} aria-label={`Review ${member.fullName}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg><span>Review</span></button></td></tr>; })}</tbody></table></div>}
      </section>

      {preview && <aside className="approval-preview"><header><div><span>Quick review</span><h2>{preview.fullName}</h2><p>{preview.controllerId}</p></div><button onClick={() => setPreview(null)}>×</button></header><dl><div><dt>School</dt><dd>{preview.school}</dd></div><div><dt>District</dt><dd>{preview.district ? <>{preview.district.name}<small>{preview.district.region.name}</small></> : "Not assigned"}</dd></div><div><dt>Ghana Card</dt><dd>{preview.ghanaCardId || "Not provided"}</dd></div><div><dt>Date of birth</dt><dd>{preview.dateOfBirth ? new Date(preview.dateOfBirth).toLocaleDateString() : "Not provided"}</dd></div><div><dt>Enrolled by</dt><dd>{preview.createdBy?.fullName || "System"}</dd></div></dl><div className="approval-preview__signals"><Signal good={preview.report20Matched} yes="Report 20 matched" no="Will become Flagged"/><Signal good={Boolean(preview.phoneVerifiedAt)} yes="Phone verified" no="Phone unverified"/></div><footer><Link to={`/members/${preview.id}`}>Open full profile</Link><button onClick={() => void bulkApprove([preview.id])}>Approve member</button><button onClick={() => { setSelected([preview.id]); setReturning(true); }}>Return</button></footer></aside>}
    </div>
    {!loading && total > 0 && <Pagination page={page} totalPages={totalPages} totalItems={total} itemLabel="pending members" onPageChange={(nextPage) => updateParams({ page: String(nextPage) })} />}
  </main>;
}
