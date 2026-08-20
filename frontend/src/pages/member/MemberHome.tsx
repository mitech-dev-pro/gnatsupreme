import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useMemberAuth } from "@/lib/MemberAuthContext";

type Beneficiary = {
  id: number;
  fullName: string;
  relationship: string;
  dateOfBirth: string | null;
  trusteeName: string | null;
  trusteeGhanaCardId: string | null;
};

type Spouse = {
  fullName: string;
  dateOfBirth: string | null;
  ghanaCardId: string | null;
};

type MemberProfile = {
  id: number;
  controllerId: string;
  fullName: string;
  dateOfBirth: string | null;
  phone: string | null;
  school: string;
  status: string;
  district: { id: number; name: string; region: { id: number; name: string } };
  spouse: Spouse | null;
  beneficiaries: Beneficiary[];
};

type BenefitLine = {
  type: string;
  amount: string;
};

type BenefitPlan = {
  effectiveFrom: string;
  benefits: BenefitLine[];
} | null;

type MemberNotification = {
  id: number;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

type ChangeRequest = {
  id: number;
  type: "MEMBER_DETAILS" | "SPOUSE" | "BENEFICIARY_ADD" | "BENEFICIARY_UPDATE" | "BENEFICIARY_REMOVE";
  status: "PENDING" | "APPROVED" | "RETURNED" | "REJECTED" | "CANCELLED";
  targetBeneficiaryId: number | null;
  requestNote: string | null;
  reviewNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
};

const RELATIONSHIPS = ["CHILD", "SPOUSE", "PARENT", "SIBLING", "OTHER"];
const REQUEST_TYPE_LABELS: Record<string, string> = {
  MEMBER_DETAILS: "My details",
  SPOUSE: "Spouse",
  BENEFICIARY_ADD: "Add beneficiary",
  BENEFICIARY_UPDATE: "Update beneficiary",
  BENEFICIARY_REMOVE: "Remove beneficiary",
};
const REQUEST_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-[#fbf0dd] text-[#b9791a]",
  APPROVED: "bg-[#dff7ee] text-[#17805f]",
  RETURNED: "bg-[#fbf0dd] text-[#b9791a]",
  REJECTED: "bg-[#fbe9e9] text-[#c23b3b]",
  CANCELLED: "bg-[#eef0fa] text-[#5b6472]",
};

const inputClasses =
  "w-full rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-3 py-2 text-[12.5px] transition focus:border-[#1f9c7c] focus:shadow-[0_0_0_3px_#dff7ee] focus:outline-none";
const labelClasses = "mb-1 block text-[11px] font-bold text-[#1e2761]";

function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDate(iso: string | null) {
  if (!iso) return "Not provided";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

function SpouseForm({
  spouse,
  onClose,
  onSubmitted,
}: {
  spouse: Spouse | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [fullName, setFullName] = useState(spouse?.fullName ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(toDateInput(spouse?.dateOfBirth ?? null));
  const [ghanaCardId, setGhanaCardId] = useState(spouse?.ghanaCardId ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/member-portal/change-requests", {
        type: "SPOUSE",
        proposedData: {
          fullName: fullName.trim(),
          dateOfBirth: dateOfBirth || null,
          ghanaCardId: ghanaCardId.trim() || null,
        },
        requestNote: note.trim() || undefined,
      });
      onSubmitted();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to submit this request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-[10px] border border-[#e5e9f0] bg-[#fafbfd] p-4">
      <div>
        <label className={labelClasses}>Full Name</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClasses} required minLength={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClasses}>Date of Birth</label>
          <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputClasses} />
        </div>
        <div>
          <label className={labelClasses}>Ghana Card ID</label>
          <input
            value={ghanaCardId}
            onChange={(e) => setGhanaCardId(e.target.value.toUpperCase())}
            placeholder="GHA-000000000-0"
            className={inputClasses}
          />
        </div>
      </div>
      <div>
        <label className={labelClasses}>Note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={inputClasses} />
      </div>
      {error && <div className="rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12px] font-semibold text-[#c23b3b]">{error}</div>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || fullName.trim().length < 2}
          className="rounded-[9px] bg-[#1f9c7c] px-4 py-2 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Submitting…" : "Submit for review"}
        </button>
        <button type="button" onClick={onClose} className="rounded-[9px] border border-[#e5e9f0] px-4 py-2 text-[12.5px] font-semibold text-[#1e2761]">
          Cancel
        </button>
      </div>
    </form>
  );
}

function BeneficiaryForm({
  beneficiary,
  onClose,
  onSubmitted,
}: {
  beneficiary: Beneficiary | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [fullName, setFullName] = useState(beneficiary?.fullName ?? "");
  const [relationship, setRelationship] = useState(beneficiary?.relationship ?? "CHILD");
  const [dateOfBirth, setDateOfBirth] = useState(toDateInput(beneficiary?.dateOfBirth ?? null));
  const [trusteeName, setTrusteeName] = useState(beneficiary?.trusteeName ?? "");
  const [trusteeGhanaCardId, setTrusteeGhanaCardId] = useState(beneficiary?.trusteeGhanaCardId ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/member-portal/change-requests", {
        type: beneficiary ? "BENEFICIARY_UPDATE" : "BENEFICIARY_ADD",
        ...(beneficiary ? { targetBeneficiaryId: beneficiary.id } : {}),
        proposedData: {
          fullName: fullName.trim(),
          relationship,
          dateOfBirth: dateOfBirth || null,
          trusteeName: trusteeName.trim() || null,
          trusteeGhanaCardId: trusteeGhanaCardId.trim() || null,
        },
        requestNote: note.trim() || undefined,
      });
      onSubmitted();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to submit this request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-[10px] border border-[#e5e9f0] bg-[#fafbfd] p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClasses}>Full Name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClasses} required minLength={2} />
        </div>
        <div>
          <label className={labelClasses}>Relationship</label>
          <select value={relationship} onChange={(e) => setRelationship(e.target.value)} className={inputClasses}>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0) + r.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={labelClasses}>Date of Birth</label>
        <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={`max-w-52 ${inputClasses}`} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClasses}>Trustee Name (optional)</label>
          <input value={trusteeName} onChange={(e) => setTrusteeName(e.target.value)} className={inputClasses} />
        </div>
        <div>
          <label className={labelClasses}>Trustee Ghana Card ID (optional)</label>
          <input
            value={trusteeGhanaCardId}
            onChange={(e) => setTrusteeGhanaCardId(e.target.value.toUpperCase())}
            placeholder="GHA-000000000-0"
            className={inputClasses}
          />
        </div>
      </div>
      <div>
        <label className={labelClasses}>Note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={inputClasses} />
      </div>
      {error && <div className="rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12px] font-semibold text-[#c23b3b]">{error}</div>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || fullName.trim().length < 2}
          className="rounded-[9px] bg-[#1f9c7c] px-4 py-2 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Submitting…" : "Submit for review"}
        </button>
        <button type="button" onClick={onClose} className="rounded-[9px] border border-[#e5e9f0] px-4 py-2 text-[12.5px] font-semibold text-[#1e2761]">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function MemberHome() {
  const { member, logout } = useMemberAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [benefitPlan, setBenefitPlan] = useState<BenefitPlan>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<MemberNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);

  const [editingSpouse, setEditingSpouse] = useState(false);
  const [addingBeneficiary, setAddingBeneficiary] = useState(false);
  const [editingBeneficiaryId, setEditingBeneficiaryId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [removingId, setRemovingId] = useState<number | null>(null);

  const loadProfile = async () => {
    const res = await api.get("/member-portal/profile");
    setProfile(res.data.data.member);
    setBenefitPlan(res.data.data.benefitPlan);
  };

  const loadRequests = async () => {
    try {
      const res = await api.get("/member-portal/change-requests");
      setRequests(res.data.data);
    } catch {
      // request history is supplementary — a failed fetch shouldn't block the page
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadProfile();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    (async () => {
      try {
        const res = await api.get("/member-portal/notifications");
        if (!cancelled) {
          setNotifications(res.data.data);
          setUnreadCount(res.data.unreadCount);
        }
      } catch {
        // notifications are supplementary — a failed fetch shouldn't block the page
      }
    })();
    void loadRequests();
    return () => {
      cancelled = true;
    };
  }, []);

  const markAllNotificationsRead = async () => {
    await api.patch("/member-portal/notifications/read-all");
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const afterRequestSubmitted = async () => {
    await loadRequests();
  };

  const removeBeneficiary = async (beneficiary: Beneficiary) => {
    if (!window.confirm(`Request removal of ${beneficiary.fullName} as a beneficiary?`)) return;
    setRemovingId(beneficiary.id);
    setRemoveError("");
    try {
      await api.post("/member-portal/change-requests", {
        type: "BENEFICIARY_REMOVE",
        targetBeneficiaryId: beneficiary.id,
      });
      await loadRequests();
    } catch (err: any) {
      setRemoveError(err?.response?.data?.message || "Unable to submit this request.");
    } finally {
      setRemovingId(null);
    }
  };

  const pendingFor = (type: ChangeRequest["type"], targetBeneficiaryId: number | null = null) =>
    requests.find((r) => r.status === "PENDING" && r.type === type && r.targetBeneficiaryId === targetBeneficiaryId);

  const spousePending = pendingFor("SPOUSE");

  return (
    <div className="h-screen overflow-y-auto bg-[#f4f6fa] px-5 py-8 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-7 flex flex-col gap-5 rounded-[14px] border border-[#e5e9f0] bg-white px-5 py-4 shadow-[0_5px_18px_rgba(30,39,97,0.06)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/brand/gnat-logo.png?v=1"
              alt="GNAT"
              className="h-14 w-24 shrink-0 object-contain"
            />
            <div className="h-10 w-px bg-[#e5e9f0]" />
            <div>
              <h1 className="text-[22px] font-extrabold text-[#1e2761]">
                Welcome, {member?.fullName}
              </h1>
              <div className="text-[12.5px] text-[#5b6472]">
                Controller ID {member?.controllerId}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <div className="text-right">
              <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#7a8190]">
                Underwritten by
              </div>
              <img
                src="/brand/milife-logo.png?v=1"
                alt="miLife Insurance"
                className="mt-1 h-7 w-20 object-contain"
              />
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-[9px] border border-[#e5e9f0] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#c23b3b] transition hover:bg-[#fbe9e9]"
            >
              Sign out
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-6 text-[13px] text-[#5b6472]">
            Loading your profile…
          </div>
        ) : profile ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5">
              <h2 className="mb-3 text-[15px] font-bold text-[#1e2761]">
                Coverage
              </h2>
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-[#5b6472]">Status</dt>
                  <dd className="font-semibold text-[#171b26]">
                    {profile.status}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5b6472]">School</dt>
                  <dd className="font-semibold text-[#171b26]">
                    {profile.school}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5b6472]">District</dt>
                  <dd className="font-semibold text-[#171b26]">
                    {profile.district.name}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#5b6472]">Region</dt>
                  <dd className="font-semibold text-[#171b26]">
                    {profile.district.region.name}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-bold text-[#1e2761]">Spouse</h2>
                {!editingSpouse &&
                  (spousePending ? (
                    <span className="rounded-full bg-[#fbf0dd] px-2.5 py-0.5 text-[11px] font-semibold text-[#b9791a]">
                      Review pending
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingSpouse(true)}
                      className="text-[11.5px] font-semibold text-[#1f9c7c] hover:underline"
                    >
                      {profile.spouse ? "Request update" : "Add spouse"}
                    </button>
                  ))}
              </div>
              {profile.spouse ? (
                <dl className="space-y-2 text-[13px]">
                  <div className="flex justify-between">
                    <dt className="text-[#5b6472]">Full Name</dt>
                    <dd className="font-semibold text-[#171b26]">{profile.spouse.fullName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[#5b6472]">Date of Birth</dt>
                    <dd className="font-semibold text-[#171b26]">{formatDate(profile.spouse.dateOfBirth)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[#5b6472]">Ghana Card ID</dt>
                    <dd className="font-semibold text-[#171b26]">{profile.spouse.ghanaCardId ?? "Not provided"}</dd>
                  </div>
                </dl>
              ) : (
                <div className="text-[13px] text-[#5b6472]">No spouse on record.</div>
              )}
              {editingSpouse && (
                <SpouseForm
                  spouse={profile.spouse}
                  onClose={() => setEditingSpouse(false)}
                  onSubmitted={afterRequestSubmitted}
                />
              )}
            </div>

            <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5 sm:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-bold text-[#1e2761]">
                  Beneficiaries ({profile.beneficiaries.length}/10)
                </h2>
                {!addingBeneficiary && profile.beneficiaries.length < 10 && (
                  <button
                    type="button"
                    onClick={() => setAddingBeneficiary(true)}
                    className="text-[11.5px] font-semibold text-[#1f9c7c] hover:underline"
                  >
                    Add beneficiary
                  </button>
                )}
              </div>

              {removeError && (
                <div className="mb-3 rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12px] font-semibold text-[#c23b3b]">{removeError}</div>
              )}

              {profile.beneficiaries.length === 0 ? (
                <div className="text-[13px] text-[#5b6472]">No beneficiaries on record.</div>
              ) : (
                <ul className="divide-y divide-[#e5e9f0]">
                  {profile.beneficiaries.map((b) => {
                    const updatePending = pendingFor("BENEFICIARY_UPDATE", b.id);
                    const removePending = pendingFor("BENEFICIARY_REMOVE", b.id);
                    return (
                      <li key={b.id} className="py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-[13px] font-semibold text-[#171b26]">{b.fullName}</span>
                            <span className="ml-2 text-[12px] text-[#5b6472]">{b.relationship.charAt(0) + b.relationship.slice(1).toLowerCase()}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2.5">
                            {updatePending || removePending ? (
                              <span className="rounded-full bg-[#fbf0dd] px-2.5 py-0.5 text-[11px] font-semibold text-[#b9791a]">
                                Review pending
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setEditingBeneficiaryId(editingBeneficiaryId === b.id ? null : b.id)}
                                  className="text-[11.5px] font-semibold text-[#1e2761] hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeBeneficiary(b)}
                                  disabled={removingId === b.id}
                                  className="text-[11.5px] font-semibold text-[#c23b3b] hover:underline disabled:opacity-60"
                                >
                                  Remove
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {editingBeneficiaryId === b.id && (
                          <BeneficiaryForm
                            beneficiary={b}
                            onClose={() => setEditingBeneficiaryId(null)}
                            onSubmitted={afterRequestSubmitted}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {addingBeneficiary && (
                <BeneficiaryForm
                  beneficiary={null}
                  onClose={() => setAddingBeneficiary(false)}
                  onSubmitted={afterRequestSubmitted}
                />
              )}
            </div>

            {benefitPlan && (
              <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5 sm:col-span-2">
                <h2 className="mb-3 text-[15px] font-bold text-[#1e2761]">
                  Benefit Plan
                </h2>
                <ul className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
                  {benefitPlan.benefits.map((b) => (
                    <li key={b.type} className="flex justify-between">
                      <span className="text-[#5b6472]">{b.type}</span>
                      <span className="font-semibold text-[#171b26]">
                        {b.amount}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {requests.length > 0 && (
              <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5 sm:col-span-2">
                <h2 className="mb-3 text-[15px] font-bold text-[#1e2761]">My Requests</h2>
                <ul className="divide-y divide-[#e5e9f0]">
                  {requests.slice(0, 10).map((r) => (
                    <li key={r.id} className="py-2.5 text-[13px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#171b26]">{REQUEST_TYPE_LABELS[r.type]}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${REQUEST_STATUS_STYLES[r.status]}`}>
                          {r.status}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-[#5b6472]">
                        Requested {timeAgo(r.requestedAt)}
                        {r.reviewNote ? ` · ${r.reviewNote}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5 sm:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-bold text-[#1e2761]">
                  Notifications
                </h2>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    className="text-[11.5px] font-semibold text-[#1f9c7c] hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="text-[13px] text-[#5b6472]">
                  No notifications yet.
                </div>
              ) : (
                <ul className="divide-y divide-[#e5e9f0]">
                  {notifications.slice(0, 8).map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div>
                        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#171b26]">
                          {!item.readAt && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f9c7c]" />
                          )}
                          {item.title}
                        </div>
                        <div className="mt-0.5 text-[12px] text-[#5b6472]">
                          {item.message}
                        </div>
                      </div>
                      <div className="whitespace-nowrap text-[11px] text-[#9aa2c4]">
                        {timeAgo(item.createdAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-6 text-[13px] text-[#5b6472]">
            We couldn't load your profile.
          </div>
        )}
      </div>
    </div>
  );
}
