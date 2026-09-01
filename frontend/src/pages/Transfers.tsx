import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import Dropdown from "@/components/ui/Dropdown";
import Pagination from "@/components/ui/Pagination";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { Alert, EmptyState, TableSkeleton } from "@/components/ui/Feedback";
import { TextareaField } from "@/components/ui/FormField";
import StatusBadge from "@/components/ui/StatusBadge";
import TableFrame from "@/components/ui/TableFrame";
import { useAuth } from "@/lib/AuthContext";
import { useDistricts } from "@/lib/useDistricts";

type Transfer = {
  id: number;
  status: string;
  reason: string;
  reviewNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  effectiveAt: string | null;
  member: { id: number; controllerId: string; fullName: string; school: string; status: string };
  fromDistrict: { id: number; name: string; region: { id: number; name: string } };
  toDistrict: { id: number; name: string; region: { id: number; name: string } };
  requestedBy: { id: number; fullName: string };
  reviewedBy: { id: number; fullName: string } | null;
};

type MemberOption = {
  id: number;
  controllerId: string;
  fullName: string;
  districtId: number | null;
  district: { id: number; name: string; region: { id: number; name: string } } | null;
};

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];
const REVIEW_ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"];

const STATUS_TONES: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function RequestTransferForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { districts } = useDistricts();
  const [memberSearch, setMemberSearch] = useState("");
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [member, setMember] = useState<MemberOption | null>(null);
  const [toDistrictId, setToDistrictId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (member || memberSearch.trim().length < 2) {
      setMemberOptions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get("/members", { params: { search: memberSearch.trim(), limit: 8 } });
        // A member with no district assigned yet can't be transferred (there's nothing to
        // transfer from) — filtered out here rather than letting staff pick one and hit a 409.
        if (!cancelled) setMemberOptions(res.data.data.filter((option: MemberOption) => option.district));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [member, memberSearch]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!member || !toDistrictId || reason.trim().length < 5) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/transfers", { memberId: member.id, toDistrictId: Number(toDistrictId), reason: reason.trim() });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to request this transfer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 rounded-[12px] border border-[#e5e9f0] bg-white p-5">
      <h2 className="mb-3 text-[14.5px] font-bold text-[#1e2761]">Request a transfer</h2>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="transfer-member-search" className="mb-1 block text-[11px] font-bold text-[#1e2761]">Member</label>
          {member ? (
            <div className="flex items-center justify-between rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-3 py-2 text-[12.5px]">
              <span>
                <strong>{member.fullName}</strong> · {member.controllerId} · currently {member.district?.name ?? "no district"}
              </span>
              <button type="button" onClick={() => setMember(null)} className="font-semibold text-[#c23b3b]">
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                id="transfer-member-search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search name or Controller ID"
                role="combobox"
                aria-expanded={memberSearch.trim().length >= 2 && (searching || memberOptions.length > 0)}
                aria-controls="transfer-member-options"
                aria-autocomplete="list"
                className="w-full rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-3 py-2 text-[12.5px] focus:border-[#1f9c7c] focus:shadow-[0_0_0_3px_#dff7ee] focus:outline-none"
              />
              {memberSearch.trim().length >= 2 && (searching || memberOptions.length > 0) && (
                <div id="transfer-member-options" role="listbox" className="absolute z-10 mt-1 w-full rounded-[9px] border border-[#e5e9f0] bg-white shadow-lg">
                  {searching ? (
                    <div className="px-3 py-2 text-[12.5px] text-[#5b6472]">Searching…</div>
                  ) : (
                    memberOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected="false"
                        onClick={() => {
                          setMember(option);
                          setMemberSearch("");
                          setMemberOptions([]);
                        }}
                        className="block w-full px-3 py-2 text-left text-[12.5px] hover:bg-[#fafbfd]"
                      >
                        <strong>{option.fullName}</strong> · {option.controllerId} · {option.district?.name ?? "no district"}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="max-w-72">
          <label className="mb-1.5 block text-[11.5px] font-bold text-(--text-strong)">Destination district</label>
          <Dropdown
            value={toDistrictId}
            onChange={setToDistrictId}
            placeholder="Select district"
            options={districts
              .filter((d) => d.id !== member?.districtId)
              .map((d) => ({ value: String(d.id), label: `${d.name} (${d.region.name})` }))}
          />
        </div>

          <TextareaField
            label="Reason"
            hint={`${reason.length}/500 characters. Enter at least 5 characters.`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Explain why this member is transferring districts"
          />

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex gap-2">
          <Button
            type="submit"
            loading={busy}
            loadingLabel="Submitting…"
            disabled={busy || !member || !toDistrictId || reason.trim().length < 5}
          >
            Submit request
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function Transfers() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Transfer[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const page = Math.max(1, Number(params.get("page")) || 1);
  const status = params.get("status") ?? "";
  const limit = 20;
  const canReview = user ? REVIEW_ROLES.includes(user.role) : false;

  const updateParams = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    setParams(next);
  };

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/transfers", { signal, params: { page, limit, status: status || undefined } });
      setRows(res.data.data);
      setTotal(res.data.pagination.total);
      setTotalPages(Math.max(1, res.data.pagination.totalPages));
    } catch {
      if (!signal?.aborted) setError("Transfers could not be loaded.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const review = async (id: number, decision: "APPROVED" | "REJECTED") => {
    setBusyId(id);
    setError("");
    try {
      await api.patch(`/transfers/${id}/review`, { decision, reviewNote: reviewNote.trim() || undefined });
      setReviewingId(null);
      setReviewNote("");
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to review this transfer.");
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (id: number) => {
    setBusyId(id);
    setError("");
    try {
      await api.patch(`/transfers/${id}/cancel`, {});
      setCancellingId(null);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to cancel this transfer.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader title="Transfers" description="Move members between districts with a reviewable audit trail." actions={<Button variant={showForm ? "secondary" : "primary"} onClick={() => setShowForm((v) => !v)}>{showForm ? "Close request form" : "Request transfer"}</Button>} />

      {showForm && (
        <RequestTransferForm onClose={() => setShowForm(false)} onCreated={() => void load()} />
      )}

      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}

      <div className="mb-4 max-w-52">
        <label className="mb-1.5 block text-[11.5px] font-bold text-(--text-strong)">Transfer status</label>
        <Dropdown
          value={status}
          onChange={(value) => updateParams({ status: value || null, page: null })}
          options={[{ value: "", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: s }))]}
        />
      </div>

      <TableFrame label="Transfer requests" className="min-w-[900px]">
            <thead>
              <tr className="border-b border-[#e5e9f0] bg-[#fafbfd] text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
                <th className="px-4 py-2.5">Member</th>
                <th className="px-4 py-2.5">From</th>
                <th className="px-4 py-2.5">To</th>
                <th className="px-4 py-2.5">Requested</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <TableSkeleton columns={6} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}><EmptyState title="No transfers found" description={status ? "No transfer requests match this status. Choose another status to broaden the list." : "Transfer requests will appear here after they are submitted."} /></td>
                </tr>
              ) : (
                rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className="border-b border-[#e5e9f0] last:border-0">
                      <td className="px-4 py-2.5">
                        <Link to={`/members/${row.member.id}`} className="font-semibold text-[#1e2761] hover:underline">
                          {row.member.fullName}
                        </Link>
                        <div className="text-[11px] text-[#5b6472]">{row.member.controllerId}</div>
                      </td>
                      <td className="px-4 py-2.5 text-[#5b6472]">{row.fromDistrict.name}</td>
                      <td className="px-4 py-2.5 text-[#5b6472]">{row.toDistrict.name}</td>
                      <td className="px-4 py-2.5 text-[#5b6472]">
                        {formatDate(row.requestedAt)}
                        <div className="text-[11px]">by {row.requestedBy.fullName}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone={STATUS_TONES[row.status] ?? "neutral"}>
                          {row.status}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-2.5">
                        {row.status === "PENDING" && (
                          <div className="flex flex-wrap gap-1.5">
                            {canReview && (
                              <button
                                type="button"
                                onClick={() => setReviewingId(reviewingId === row.id ? null : row.id)}
                                disabled={busyId === row.id}
                                className="rounded-[7px] border border-[#e5e9f0] px-2.5 py-1 text-[11.5px] font-semibold text-[#1e2761] disabled:opacity-60"
                              >
                                Review
                              </button>
                            )}
                            {(row.requestedBy.id === user?.id || (user && ["SUPER_ADMIN", "NATIONAL_ADMIN"].includes(user.role))) && (
                              <button
                                type="button"
                                onClick={() => setCancellingId(row.id)}
                                disabled={busyId === row.id}
                                className="rounded-[7px] border border-[#e5e9f0] px-2.5 py-1 text-[11.5px] font-semibold text-[#c23b3b] disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        )}
                        {row.status !== "PENDING" && row.reviewedBy && (
                          <span className="text-[11px] text-[#5b6472]">by {row.reviewedBy.fullName}</span>
                        )}
                      </td>
                    </tr>
                    {cancellingId === row.id && (
                      <tr className="border-b border-[#e5e9f0]">
                        <td colSpan={6} className="px-4 py-3">
                          <ConfirmationPanel
                            title="Cancel this transfer request?"
                            description={`${row.member.fullName} will remain in ${row.fromDistrict.name}. This request will stay in the audit trail as cancelled.`}
                            confirmLabel="Cancel transfer"
                            busyLabel="Cancelling…"
                            busy={busyId === row.id}
                            onConfirm={() => void cancel(row.id)}
                            onCancel={() => setCancellingId(null)}
                          />
                        </td>
                      </tr>
                    )}
                    {reviewingId === row.id && (
                      <tr className="border-b border-[#e5e9f0] bg-[#fafbfd]">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              aria-label={`Review note for ${row.member.fullName}`}
                              value={reviewNote}
                              onChange={(e) => setReviewNote(e.target.value)}
                              placeholder="Review note (optional)"
                              maxLength={500}
                              className="min-w-64 flex-1 rounded-[9px] border border-[#e5e9f0] bg-white px-3 py-1.5 text-[12.5px] focus:border-[#1f9c7c] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void review(row.id, "APPROVED")}
                              disabled={busyId === row.id}
                              className="rounded-[9px] bg-[#1f9c7c] px-3.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-60"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => void review(row.id, "REJECTED")}
                              disabled={busyId === row.id}
                              className="rounded-[9px] border border-[#c23b3b] px-3.5 py-1.5 text-[12px] font-bold text-[#c23b3b] disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
      </TableFrame>

      <Pagination page={page} totalPages={totalPages} totalItems={total} itemLabel="transfers" onPageChange={(nextPage) => updateParams({ page: String(nextPage) })} />
    </div>
  );
}
