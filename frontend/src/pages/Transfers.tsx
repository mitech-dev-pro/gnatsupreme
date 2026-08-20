import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import Pagination from "@/components/ui/Pagination";
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
  districtId: number;
  district: { id: number; name: string; region: { id: number; name: string } };
};

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];
const REVIEW_ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"];

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-[#fbf0dd] text-[#b9791a]",
  APPROVED: "bg-[#dff7ee] text-[#17805f]",
  REJECTED: "bg-[#fbe9e9] text-[#c23b3b]",
  CANCELLED: "bg-[#eef0fa] text-[#5b6472]",
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
        if (!cancelled) setMemberOptions(res.data.data);
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
          <label className="mb-1 block text-[11px] font-bold text-[#1e2761]">Member</label>
          {member ? (
            <div className="flex items-center justify-between rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-3 py-2 text-[12.5px]">
              <span>
                <strong>{member.fullName}</strong> · {member.controllerId} · currently {member.district.name}
              </span>
              <button type="button" onClick={() => setMember(null)} className="font-semibold text-[#c23b3b]">
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search name or Controller ID"
                className="w-full rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-3 py-2 text-[12.5px] focus:border-[#1f9c7c] focus:shadow-[0_0_0_3px_#dff7ee] focus:outline-none"
              />
              {memberSearch.trim().length >= 2 && (searching || memberOptions.length > 0) && (
                <div className="absolute z-10 mt-1 w-full rounded-[9px] border border-[#e5e9f0] bg-white shadow-lg">
                  {searching ? (
                    <div className="px-3 py-2 text-[12.5px] text-[#5b6472]">Searching…</div>
                  ) : (
                    memberOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setMember(option);
                          setMemberSearch("");
                          setMemberOptions([]);
                        }}
                        className="block w-full px-3 py-2 text-left text-[12.5px] hover:bg-[#fafbfd]"
                      >
                        <strong>{option.fullName}</strong> · {option.controllerId} · {option.district.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="max-w-72">
          <label className="mb-1 block text-[11px] font-bold text-[#1e2761]">Destination district</label>
          <select
            value={toDistrictId}
            onChange={(e) => setToDistrictId(e.target.value)}
            className="w-full rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-3 py-2 text-[12.5px] focus:border-[#1f9c7c] focus:outline-none"
          >
            <option value="">Select district</option>
            {districts
              .filter((d) => d.id !== member?.districtId)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.region.name})
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-bold text-[#1e2761]">Reason</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Explain why this member is transferring districts"
            className="w-full rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-3 py-2 text-[12.5px] focus:border-[#1f9c7c] focus:shadow-[0_0_0_3px_#dff7ee] focus:outline-none"
          />
        </div>

        {error && <div className="rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12.5px] font-semibold text-[#c23b3b]">{error}</div>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || !member || !toDistrictId || reason.trim().length < 5}
            className="rounded-[9px] bg-[#1f9c7c] px-4 py-2 text-[12.5px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Submit request"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[9px] border border-[#e5e9f0] px-4 py-2 text-[12.5px] font-semibold text-[#1e2761]"
          >
            Cancel
          </button>
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/transfers", { params: { page, limit, status: status || undefined } });
      setRows(res.data.data);
      setTotal(res.data.pagination.total);
      setTotalPages(Math.max(1, res.data.pagination.totalPages));
    } catch {
      setError("Transfers could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
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
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#1e2761]">Transfers</h1>
          <div className="mt-1 text-[12.5px] text-[#5b6472]">
            Move members between districts, with review and audit trail.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-[9px] bg-[#1f9c7c] px-4 py-2 text-[12.5px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f]"
        >
          {showForm ? "Close" : "Request Transfer"}
        </button>
      </div>

      {showForm && (
        <RequestTransferForm onClose={() => setShowForm(false)} onCreated={() => void load()} />
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12.5px] font-semibold text-[#c23b3b]">
          {error}
        </div>
      )}

      <div className="mb-4">
        <select
          value={status}
          onChange={(e) => updateParams({ status: e.target.value || null, page: null })}
          className="rounded-[9px] border border-[#e5e9f0] bg-white px-3 py-2 text-[12.5px] text-[#171b26]"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[#e5e9f0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[12.5px]">
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
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#5b6472]">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#5b6472]">
                    No transfers found.
                  </td>
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
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[row.status] ?? ""}`}>
                          {row.status}
                        </span>
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
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} totalItems={total} itemLabel="transfers" onPageChange={(nextPage) => updateParams({ page: String(nextPage) })} />
    </div>
  );
}
