import { useEffect, useState, type FormEvent } from "react";
import api from "@/lib/api";
import { useMemberAuth } from "@/lib/MemberAuthContext";
import { formatCurrency } from "@/lib/currency";
import { useOrganizationSettings } from "@/lib/OrganizationSettingsContext";

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
  enabled: boolean;
  memberAmount: string;
  spouseAmount: string | null;
  note: string | null;
};

type BenefitPlan = {
  effectiveFrom: string;
  monthlyPremium: string;
  collectionMethod: string;
  note: string | null;
  benefits: BenefitLine[];
} | null;

const BENEFIT_LABELS: Record<string, string> = {
  DEATH: "Death / Funeral Benefit",
  TOTAL_PERMANENT_DISABILITY: "Total Permanent Disability",
  CRITICAL_ILLNESS: "Critical Illness",
  HOSPITALIZATION: "Hospitalisation",
};

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

export type MemberPortalSection = "overview" | "profile" | "household" | "coverage" | "requests" | "claims" | "notifications" | "help";

export default function MemberHome({ section = "overview" }: { section?: MemberPortalSection }) {
  const { settings } = useOrganizationSettings();
  useMemberAuth();
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
    <div>
        {loading ? (
          <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-6 text-[13px] text-[#5b6472]">
            Loading your profile…
          </div>
        ) : profile ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:gap-5">
            {(section === "overview" || section === "profile") && <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5 md:col-span-2 xl:col-span-1">
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
                  <dt className="text-[#5b6472]">{settings.subRegionLabel}</dt>
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
            </div>}

            {(section === "overview" || section === "household") && <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5">
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
            </div>}

            {(section === "overview" || section === "household") && <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5 md:col-span-2">
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
            </div>}

            {(section === "overview" || section === "coverage") && benefitPlan && (
              <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5 md:col-span-2">
                <h2 className="mb-3 text-[15px] font-bold text-[#1e2761]">
                  Benefit Plan
                </h2>
                <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-[#5b6472]">
                  <span>Effective {new Date(benefitPlan.effectiveFrom).toLocaleDateString()}</span>
                  <span>{formatCurrency(benefitPlan.monthlyPremium, settings.currency)} monthly premium</span>
                  <span>{benefitPlan.collectionMethod}</span>
                </div>
                {benefitPlan.note && <p className="mb-4 max-w-[70ch] text-[12.5px] text-[#5b6472]">{benefitPlan.note}</p>}
                <ul className="divide-y divide-[#e5e9f0] text-[13px]">
                  {benefitPlan.benefits.filter((benefit) => benefit.enabled).map((b) => (
                    <li key={b.type} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="font-semibold text-[#1e2761]">{BENEFIT_LABELS[b.type] ?? b.type}</span>
                        <span className="font-semibold text-[#171b26]">Member {formatCurrency(b.memberAmount, settings.currency)}{b.spouseAmount !== null ? ` · Spouse ${formatCurrency(b.spouseAmount, settings.currency)}` : ""}</span>
                      </div>
                      {b.note && <p className="mt-1 max-w-[70ch] text-[12px] leading-relaxed text-[#5b6472]">{b.note}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(section === "overview" || section === "requests") && requests.length > 0 && (
              <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5 md:col-span-2">
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
            {section === "requests" && requests.length === 0 && <div className="rounded-[14px] border border-(--border-default) bg-(--surface-raised) p-6 text-[12.5px] text-(--text-muted) md:col-span-2">You have not submitted any change requests yet.</div>}

            {(section === "overview" || section === "notifications") && <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5 md:col-span-2">
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
            </div>}

            {section === "claims" && <div className="rounded-[14px] border border-(--border-default) bg-(--surface-raised) p-6 md:col-span-2"><h2 className="text-[15px] font-bold text-(--text-strong)">Claims</h2><p className="mt-1 max-w-[65ch] text-[12.5px] text-(--text-muted)">Your submitted claims and their processing status will appear here.</p></div>}

            {section === "help" && <div className="rounded-[14px] border border-(--border-default) bg-(--surface-raised) p-6 md:col-span-2"><h2 className="text-[15px] font-bold text-(--text-strong)">Help and support</h2><p className="mt-1 text-[12.5px] text-(--text-muted)">Contact {settings.schemeSponsor} if you need help with your membership record.</p><div className="mt-4 flex flex-wrap gap-2 text-[12px]">{settings.organizationPhone && <a className="rounded-[9px] border border-(--border-default) px-3 py-2 font-semibold text-(--text-strong) no-underline" href={`tel:${settings.organizationPhone}`}>Call {settings.organizationPhone}</a>}{settings.organizationEmail && <a className="rounded-[9px] border border-(--border-default) px-3 py-2 font-semibold text-(--text-strong) no-underline" href={`mailto:${settings.organizationEmail}`}>Email support</a>}</div>{settings.privacyNotice && <div className="mt-5 border-t border-(--border-default) pt-4"><h3 className="text-[13px] font-bold text-(--text-strong)">Privacy notice</h3><p className="mt-1 max-w-[75ch] whitespace-pre-wrap text-[12px] leading-relaxed text-(--text-muted)">{settings.privacyNotice}</p></div>}</div>}
          </div>
        ) : (
          <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-6 text-[13px] text-[#5b6472]">
            We couldn't load your profile.
          </div>
        )}
    </div>
  );
}
