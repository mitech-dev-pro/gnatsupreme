import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useMemberAuth } from "@/lib/MemberAuthContext";
import { formatCurrency } from "@/lib/currency";
import { useOrganizationSettings } from "@/lib/OrganizationSettingsContext";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";

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
  ghanaCardId: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  school: string;
  status: string;
  report20Matched: boolean;
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

function MemberDetailsForm({ profile, onClose, onSubmitted }: { profile: MemberProfile; onClose: () => void; onSubmitted: () => void }) {
  const [fullName, setFullName] = useState(profile.fullName);
  const [dateOfBirth, setDateOfBirth] = useState(toDateInput(profile.dateOfBirth));
  const [ghanaCardId, setGhanaCardId] = useState(profile.ghanaCardId ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [school, setSchool] = useState(profile.school);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const changed = fullName.trim() !== profile.fullName || dateOfBirth !== toDateInput(profile.dateOfBirth) || ghanaCardId.trim() !== (profile.ghanaCardId ?? "") || phone.trim() !== (profile.phone ?? "") || school.trim() !== profile.school;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!changed) return;
    const proposedData: Record<string, string | null> = {};
    if (fullName.trim() !== profile.fullName) proposedData.fullName = fullName.trim();
    if (dateOfBirth !== toDateInput(profile.dateOfBirth)) proposedData.dateOfBirth = dateOfBirth || null;
    if (ghanaCardId.trim() !== (profile.ghanaCardId ?? "")) proposedData.ghanaCardId = ghanaCardId.trim() || null;
    if (phone.trim() !== (profile.phone ?? "")) proposedData.phone = phone.trim() || null;
    if (school.trim() !== profile.school) proposedData.school = school.trim();
    setBusy(true); setError("");
    try {
      await api.post("/member-portal/change-requests", { type: "MEMBER_DETAILS", proposedData, requestNote: note.trim() || undefined });
      await onSubmitted(); onClose();
    } catch (err: any) { setError(err?.response?.data?.message || "Unable to submit this request."); }
    finally { setBusy(false); }
  };

  return <form onSubmit={submit} className="border-t border-(--border-default) px-5 py-5 sm:px-6">
    <div className="mb-4"><h3 className="text-[13.5px] font-bold text-(--text-strong)">Request profile changes</h3><p className="mt-0.5 text-[11.5px] text-(--text-muted)">Your current details remain active until an administrator approves this request.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><label htmlFor="member-profile-name" className={labelClasses}>Full legal name</label><input id="member-profile-name" value={fullName} onChange={(event) => setFullName(event.target.value)} className={inputClasses} minLength={2} required /></div>
      <div><label htmlFor="member-profile-dob" className={labelClasses}>Date of birth</label><input id="member-profile-dob" type="date" max={new Date().toISOString().slice(0, 10)} value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} className={inputClasses} /></div>
      <div><label htmlFor="member-profile-card" className={labelClasses}>Ghana Card ID</label><input id="member-profile-card" value={ghanaCardId} onChange={(event) => setGhanaCardId(event.target.value.toUpperCase())} placeholder="GHA-000000000-0" className={inputClasses} /></div>
      <div><label htmlFor="member-profile-phone" className={labelClasses}>Phone number</label><input id="member-profile-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClasses} /></div>
      <div className="sm:col-span-2"><label htmlFor="member-profile-school" className={labelClasses}>School or institution</label><input id="member-profile-school" value={school} onChange={(event) => setSchool(event.target.value)} className={inputClasses} minLength={2} required /></div>
      <div className="sm:col-span-2"><label htmlFor="member-profile-note" className={labelClasses}>Reason or note (optional)</label><textarea id="member-profile-note" value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={500} className={inputClasses} /></div>
    </div>
    {error && <div role="alert" className="mt-4 rounded-[9px] bg-(--danger-soft) px-3 py-2 text-[12px] font-semibold text-(--danger)">{error}</div>}
    <div className="mt-4 flex flex-wrap gap-2"><button type="submit" disabled={busy || !changed} className="min-h-10 rounded-[9px] bg-(--action-primary) px-4 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Submitting…" : "Submit for review"}</button><button type="button" onClick={onClose} disabled={busy} className="min-h-10 rounded-[9px] border border-(--border-default) px-4 text-[12px] font-semibold text-(--text-strong)">Cancel</button></div>
  </form>;
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

  const [editingProfile, setEditingProfile] = useState(false);
  const [editingSpouse, setEditingSpouse] = useState(false);
  const [addingBeneficiary, setAddingBeneficiary] = useState(false);
  const [editingBeneficiaryId, setEditingBeneficiaryId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [beneficiaryToRemove, setBeneficiaryToRemove] = useState<Beneficiary | null>(null);

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
    setRemovingId(beneficiary.id);
    setRemoveError("");
    try {
      await api.post("/member-portal/change-requests", {
        type: "BENEFICIARY_REMOVE",
        targetBeneficiaryId: beneficiary.id,
      });
      await loadRequests();
      setBeneficiaryToRemove(null);
    } catch (err: any) {
      setRemoveError(err?.response?.data?.message || "Unable to submit this request.");
    } finally {
      setRemovingId(null);
    }
  };

  const pendingFor = (type: ChangeRequest["type"], targetBeneficiaryId: number | null = null) =>
    requests.find((r) => r.status === "PENDING" && r.type === type && r.targetBeneficiaryId === targetBeneficiaryId);

  const spousePending = pendingFor("SPOUSE");
  const profilePending = pendingFor("MEMBER_DETAILS");

  return (
    <div>
        {loading ? (
          <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-6 text-[13px] text-[#5b6472]">
            Loading your profile…
          </div>
        ) : profile ? (
          <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 xl:gap-5 ${section === "household" ? "lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]" : ""}`}>
            {section === "overview" && <>
              <section className="overflow-hidden rounded-[14px] border border-(--border-default) bg-(--surface-raised) md:col-span-2" aria-labelledby="coverage-summary-title">
                <div className="flex flex-col gap-5 px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6" style={{ backgroundColor: settings.primaryColor }}>
                  <div>
                    <div className="mb-2 flex items-center gap-2"><span className="rounded-full bg-white/14 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide">{profile.status}</span><span className="text-[11px] text-white/65">Membership coverage</span></div>
                    <h2 id="coverage-summary-title" className="text-[19px] font-extrabold">Your cover is {profile.status === "ACTIVE" ? "active" : profile.status.toLowerCase()}</h2>
                    <p className="mt-1 max-w-[60ch] text-[12px] leading-relaxed text-white/72">{profile.school} · {profile.district.name}, {profile.district.region.name}</p>
                  </div>
                  {benefitPlan && <div className="shrink-0 border-t border-white/14 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0"><span className="block text-[10px] font-semibold uppercase tracking-wide text-white/58">Monthly premium</span><strong className="mt-0.5 block text-[18px]">{formatCurrency(benefitPlan.monthlyPremium, settings.currency)}</strong><span className="mt-0.5 block text-[10.5px] text-white/65">via {benefitPlan.collectionMethod}</span></div>}
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-(--border-default) px-5 py-3 text-[11.5px] text-(--text-muted)"><span>{settings.memberIdLabel}: <strong className="text-(--text-strong)">{profile.controllerId}</strong></span>{benefitPlan && <span>Plan effective {formatDate(benefitPlan.effectiveFrom)}</span>}<Link to="/member/coverage" className="ml-auto font-bold text-(--action-primary) no-underline hover:underline">View coverage</Link></div>
              </section>

              <section className="rounded-[14px] border border-(--border-default) bg-(--surface-raised) p-5" aria-labelledby="member-actions-title">
                <h2 id="member-actions-title" className="text-[14px] font-bold text-(--text-strong)">What would you like to do?</h2>
                <nav className="mt-3 divide-y divide-(--border-default)" aria-label="Member actions">
                  {[["Review my details", "/member/profile", "Check your personal and employment information"], ["Manage my household", "/member/household", "Review spouse and beneficiary records"], ["Track my requests", "/member/requests", "Follow changes submitted for review"], ["Check my claims", "/member/claims", "View claim submission status"]].map(([label, to, description]) => <Link key={to} to={to} className="group flex min-h-13 items-center gap-3 py-2.5 text-left no-underline"><span className="min-w-0 flex-1"><strong className="block text-[12.5px] text-(--text-strong)">{label}</strong><small className="block truncate text-[10.5px] text-(--text-muted)">{description}</small></span><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4 shrink-0 text-(--text-muted) transition-transform group-hover:translate-x-0.5"><path d="m7.5 5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></Link>)}
                </nav>
              </section>

              <section className="rounded-[14px] border border-(--border-default) bg-(--surface-raised) p-5" aria-labelledby="household-summary-title">
                <div className="flex items-center justify-between gap-3"><h2 id="household-summary-title" className="text-[14px] font-bold text-(--text-strong)">Household</h2><Link to="/member/household" className="text-[11px] font-bold text-(--action-primary) no-underline hover:underline">Manage</Link></div>
                <dl className="mt-4 space-y-3 text-[12px]"><div className="flex items-center justify-between"><dt className="text-(--text-muted)">Spouse</dt><dd className="font-semibold text-(--text-strong)">{profile.spouse?.fullName ?? "Not recorded"}</dd></div><div className="flex items-center justify-between"><dt className="text-(--text-muted)">Beneficiaries</dt><dd className="font-semibold text-(--text-strong)">{profile.beneficiaries.length} of 10 recorded</dd></div><div className="flex items-center justify-between"><dt className="text-(--text-muted)">Changes awaiting review</dt><dd className="font-semibold text-(--text-strong)">{requests.filter((request) => request.status === "PENDING").length}</dd></div></dl>
              </section>

              <section className="rounded-[14px] border border-(--border-default) bg-(--surface-raised) p-5 md:col-span-2 xl:col-span-1" aria-labelledby="recent-requests-title">
                <div className="flex items-center justify-between gap-3"><h2 id="recent-requests-title" className="text-[14px] font-bold text-(--text-strong)">Recent requests</h2><Link to="/member/requests" className="text-[11px] font-bold text-(--action-primary) no-underline hover:underline">View all</Link></div>
                {requests.length === 0 ? <p className="mt-3 text-[12px] text-(--text-muted)">No change requests submitted.</p> : <ul className="mt-2 divide-y divide-(--border-default)">{requests.slice(0, 3).map((request) => <li key={request.id} className="flex items-center gap-3 py-2.5"><span className="min-w-0 flex-1"><strong className="block truncate text-[12px] text-(--text-strong)">{REQUEST_TYPE_LABELS[request.type]}</strong><small className="text-[10.5px] text-(--text-muted)">{timeAgo(request.requestedAt)}</small></span><span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${REQUEST_STATUS_STYLES[request.status]}`}>{request.status.charAt(0) + request.status.slice(1).toLowerCase()}</span></li>)}</ul>}
              </section>

              <section className="rounded-[14px] border border-(--border-default) bg-(--surface-raised) p-5 md:col-span-2 xl:col-span-1" aria-labelledby="recent-notifications-title">
                <div className="flex items-center justify-between gap-3"><h2 id="recent-notifications-title" className="text-[14px] font-bold text-(--text-strong)">Recent notifications</h2><Link to="/member/notifications" className="text-[11px] font-bold text-(--action-primary) no-underline hover:underline">View all {unreadCount > 0 ? `(${unreadCount})` : ""}</Link></div>
                {notifications.length === 0 ? <p className="mt-3 text-[12px] text-(--text-muted)">No notifications yet.</p> : <ul className="mt-2 divide-y divide-(--border-default)">{notifications.slice(0, 3).map((item) => <li key={item.id} className="flex items-start gap-2.5 py-2.5">{!item.readAt && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-(--action-primary)"/>}<span className="min-w-0 flex-1"><strong className="block truncate text-[12px] text-(--text-strong)">{item.title}</strong><small className="mt-0.5 line-clamp-1 block text-[10.5px] text-(--text-muted)">{item.message}</small></span><time className="shrink-0 text-[9.5px] text-(--text-muted)">{timeAgo(item.createdAt)}</time></li>)}</ul>}
              </section>
            </>}

            {section === "profile" && <section className="overflow-hidden rounded-[14px] border border-(--border-default) bg-(--surface-raised) md:col-span-2" aria-labelledby="member-profile-title">
              <div className="flex flex-col gap-4 border-b border-(--border-default) bg-(--surface-subtle) px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex min-w-0 items-center gap-4"><span className="grid size-14 shrink-0 place-items-center rounded-full text-[16px] font-extrabold text-white" style={{ backgroundColor: settings.primaryColor }}>{profile.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span><div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2"><h2 id="member-profile-title" className="truncate text-[18px] font-extrabold text-(--text-strong)">{profile.fullName}</h2><span className="rounded-full bg-(--success-soft) px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-(--success)">{profile.status}</span></div><p className="text-[11.5px] text-(--text-muted)">{settings.memberIdLabel} {profile.controllerId}</p></div></div>
                {!editingProfile && (profilePending ? <span className="rounded-full bg-(--warning-soft) px-3 py-1.5 text-[10.5px] font-bold text-(--warning)">Update awaiting review</span> : <button type="button" onClick={() => setEditingProfile(true)} className="min-h-10 shrink-0 rounded-[9px] bg-(--action-primary) px-4 text-[12px] font-bold text-white">Request an update</button>)}
              </div>

              <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
                <div className="px-5 py-5 sm:px-6 lg:border-r lg:border-(--border-default)"><h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-(--text-muted)">Personal and contact details</h3><dl className="mt-3 divide-y divide-(--border-default)">{[["Full legal name", profile.fullName], ["Date of birth", formatDate(profile.dateOfBirth)], ["Ghana Card ID", profile.ghanaCardId ?? "Not provided"], ["Phone number", profile.phone ?? "Not provided"]].map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[150px_1fr]"><dt className="text-[11.5px] text-(--text-muted)">{label}</dt><dd className="break-words text-[12.5px] font-semibold text-(--ink)">{value}{label === "Phone number" && profile.phoneVerifiedAt && <span className="ml-2 rounded-full bg-(--success-soft) px-2 py-0.5 text-[9px] font-bold text-(--success)">Verified</span>}</dd></div>)}</dl></div>
                <div className="px-5 py-5 sm:px-6"><h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-(--text-muted)">Membership context</h3><dl className="mt-3 divide-y divide-(--border-default)">{[["School or institution", profile.school], [settings.subRegionLabel, profile.district.name], ["Region", profile.district.region.name], [settings.reconciliationSource, profile.report20Matched ? "Matched" : "Needs review"]].map(([label, value]) => <div key={label} className="py-3"><dt className="text-[10.5px] text-(--text-muted)">{label}</dt><dd className="mt-0.5 text-[12.5px] font-semibold text-(--ink)">{value}</dd></div>)}</dl><p className="mt-3 rounded-[9px] bg-(--info-soft) px-3 py-2 text-[10.5px] leading-relaxed text-(--text-muted)">Changes to these records are reviewed before they become active.</p></div>
              </div>
              {editingProfile && <MemberDetailsForm profile={profile} onClose={() => setEditingProfile(false)} onSubmitted={afterRequestSubmitted} />}
            </section>}

            {section === "household" && <section className="overflow-hidden rounded-[14px] border border-(--border-default) bg-(--surface-raised) md:col-span-2" aria-labelledby="household-title"><div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><h2 id="household-title" className="text-[18px] font-extrabold text-(--text-strong)">Your household</h2><p className="mt-1 text-[11.5px] text-(--text-muted)">Review the spouse and beneficiaries connected to your membership.</p></div><div className="flex gap-5 text-[11px] text-(--text-muted)"><span><strong className="block text-[17px] text-(--text-strong)">{profile.spouse ? 1 : 0}</strong> spouse</span><span><strong className="block text-[17px] text-(--text-strong)">{profile.beneficiaries.length}</strong> beneficiaries</span><span><strong className="block text-[17px] text-(--text-strong)">{requests.filter((request) => request.status === "PENDING" && request.type !== "MEMBER_DETAILS").length}</strong> pending</span></div></div></section>}

            {section === "household" && <section className="rounded-[14px] border border-(--border-default) bg-(--surface-raised) p-5" aria-labelledby="spouse-title">
              <div className="mb-3 flex items-center justify-between">
                <div><h2 id="spouse-title" className="text-[15px] font-bold text-(--text-strong)">Spouse</h2><p className="mt-0.5 text-[10.5px] text-(--text-muted)">{profile.spouse ? "One spouse is recorded" : "No spouse is currently recorded"}</p></div>
                {!editingSpouse &&
                  (spousePending ? (
                    <span className="rounded-full bg-[#fbf0dd] px-2.5 py-0.5 text-[11px] font-semibold text-[#b9791a]">
                      Review pending
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingSpouse(true)}
                      className="min-h-9 rounded-[8px] border border-(--border-default) px-3 text-[11.5px] font-semibold text-(--action-primary) hover:bg-(--surface-subtle)"
                    >
                      {profile.spouse ? "Request update" : "Add spouse"}
                    </button>
                  ))}
              </div>
              {profile.spouse ? (
                <dl className="mt-4 divide-y divide-(--border-default) text-[13px]">
                  <div className="py-2.5">
                    <dt className="text-[#5b6472]">Full Name</dt>
                    <dd className="mt-0.5 font-semibold text-[#171b26]">{profile.spouse.fullName}</dd>
                  </div>
                  <div className="py-2.5">
                    <dt className="text-[#5b6472]">Date of Birth</dt>
                    <dd className="mt-0.5 font-semibold text-[#171b26]">{formatDate(profile.spouse.dateOfBirth)}</dd>
                  </div>
                  <div className="py-2.5">
                    <dt className="text-[#5b6472]">Ghana Card ID</dt>
                    <dd className="mt-0.5 break-words font-semibold text-[#171b26]">{profile.spouse.ghanaCardId ?? "Not provided"}</dd>
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
            </section>}

            {section === "household" && <section className="rounded-[14px] border border-(--border-default) bg-(--surface-raised) p-5" aria-labelledby="beneficiaries-title">
              <div className="mb-3 flex items-center justify-between">
                <div><h2 id="beneficiaries-title" className="text-[15px] font-bold text-(--text-strong)">
                  Beneficiaries ({profile.beneficiaries.length}/10)
                </h2><p className="mt-0.5 text-[10.5px] text-(--text-muted)">People nominated to receive eligible benefits</p></div>
                {!addingBeneficiary && profile.beneficiaries.length < 10 && (
                  <button
                    type="button"
                    onClick={() => setAddingBeneficiary(true)}
                    className="min-h-9 rounded-[8px] bg-(--action-primary) px-3 text-[11.5px] font-bold text-white"
                  >
                    Add beneficiary
                  </button>
                )}
              </div>

              {removeError && (
                <div className="mb-3 rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12px] font-semibold text-[#c23b3b]">{removeError}</div>
              )}

              {beneficiaryToRemove && <div className="mb-4"><ConfirmationPanel title={`Remove ${beneficiaryToRemove.fullName}?`} description="A removal request will be sent for administrative review. The beneficiary remains on your record until the request is approved." confirmLabel="Request removal" busyLabel="Submitting…" busy={removingId === beneficiaryToRemove.id} onConfirm={() => void removeBeneficiary(beneficiaryToRemove)} onCancel={() => setBeneficiaryToRemove(null)} /></div>}

              {profile.beneficiaries.length === 0 ? (
                <div className="text-[13px] text-[#5b6472]">No beneficiaries on record.</div>
              ) : (
                <ul className="divide-y divide-[#e5e9f0]">
                  {profile.beneficiaries.map((b) => {
                    const updatePending = pendingFor("BENEFICIARY_UPDATE", b.id);
                    const removePending = pendingFor("BENEFICIARY_REMOVE", b.id);
                    return (
                      <li key={b.id} className="py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-[#171b26]">{b.fullName}</span>
                            <span className="mt-0.5 block text-[11px] text-[#5b6472]">{b.relationship.charAt(0) + b.relationship.slice(1).toLowerCase()} · Born {formatDate(b.dateOfBirth)}</span>
                            {b.trusteeName && <span className="mt-0.5 block text-[10.5px] text-[#5b6472]">Trustee: {b.trusteeName}</span>}
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
                                  className="min-h-8 rounded-[7px] border border-(--border-default) px-2.5 text-[11px] font-semibold text-(--text-strong)"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setBeneficiaryToRemove(b)}
                                  disabled={removingId === b.id}
                                  className="min-h-8 rounded-[7px] px-2.5 text-[11px] font-semibold text-(--danger) hover:bg-(--danger-soft) disabled:opacity-60"
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
            </section>}

            {section === "coverage" && benefitPlan && (
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

            {section === "requests" && requests.length > 0 && (
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
            {section === "coverage" && !benefitPlan && <div className="rounded-[14px] border border-(--border-default) bg-(--surface-raised) p-6 text-[12.5px] text-(--text-muted) md:col-span-2">No active benefit plan is available yet.</div>}
            {section === "requests" && requests.length === 0 && <div className="rounded-[14px] border border-(--border-default) bg-(--surface-raised) p-6 text-[12.5px] text-(--text-muted) md:col-span-2">You have not submitted any change requests yet.</div>}

            {section === "notifications" && <div className="rounded-[14px] border border-[#e5e9f0] bg-white p-5 md:col-span-2">
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
