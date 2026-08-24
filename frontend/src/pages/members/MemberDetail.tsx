import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import DatePicker from "@/components/ui/DatePicker";
import Dropdown from "@/components/ui/Dropdown";
import { Alert, TableSkeleton } from "@/components/ui/Feedback";
import StatusBadge from "@/components/ui/StatusBadge";
import { useDistricts } from "@/lib/useDistricts";
import { parseISODate, toISODate } from "@/lib/utils";
import "./MemberDetail.css";

const RELATIONSHIPS = ["CHILD", "SPOUSE", "PARENT", "SIBLING", "OTHER"];
const REMOVAL_REASONS = [
  "DEATH",
  "DISABILITY",
  "RETIREMENT",
  "RESIGNATION",
  "OTHER",
];
const ELEVATED_ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"];

const inputClasses =
  "w-full rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-3 py-2 text-[12.5px] transition focus:border-[#1f9c7c] focus:shadow-[0_0_0_3px_#dff7ee] focus:outline-none";
const labelClasses = "mb-1 block text-[11px] font-bold text-[#1e2761]";

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

type MemberDetailData = {
  id: number;
  controllerId: string;
  fullName: string;
  dateOfBirth: string | null;
  ghanaCardId: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  email: string | null;
  school: string;
  status: string;
  report20Matched: boolean;
  missingFromReport20At: string | null;
  createdAt: string;
  district: { id: number; name: string; region: { id: number; name: string } } | null;
  spouse: Spouse | null;
  beneficiaries: Beneficiary[];
  createdBy: { id: number; fullName: string } | null;
};

type WorkflowEvent = {
  id: number;
  action: string;
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  note: string | null;
  createdAt: string;
  performedBy: { id: number; fullName: string; role: string };
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toDateInput(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="member-data-field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function MemberDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const canReview = user ? ELEVATED_ROLES.includes(user.role) : false;

  const [member, setMember] = useState<MemberDetailData | null>(null);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [checkResult, setCheckResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<
    | { type: "spouse" }
    | { type: "beneficiary"; id: number; name: string }
    | { type: "approve" }
    | null
  >(null);

  const [editing, setEditing] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editGhanaCard, setEditGhanaCard] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSchool, setEditSchool] = useState("");

  const [passwordResult, setPasswordResult] = useState<string | null>(null);
  const [confirmingPasswordReset, setConfirmingPasswordReset] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const { districts } = useDistricts();
  const [assigningDistrict, setAssigningDistrict] = useState(false);
  const [assignDistrictId, setAssignDistrictId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState("");

  const [editingSpouse, setEditingSpouse] = useState(false);
  const [spouseName, setSpouseName] = useState("");
  const [spouseDob, setSpouseDob] = useState("");
  const [spouseGhanaCard, setSpouseGhanaCard] = useState("");

  const [addingBeneficiary, setAddingBeneficiary] = useState(false);
  const [newBeneficiary, setNewBeneficiary] = useState({
    fullName: "",
    relationship: "CHILD",
    dateOfBirth: "",
  });

  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const [showRemoveForm, setShowRemoveForm] = useState(false);
  const [removeReason, setRemoveReason] = useState("DEATH");
  const [removeNote, setRemoveNote] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [memberRes, eventsRes] = await Promise.all([
        api.get(`/members/${id}`),
        api.get(`/members/${id}/workflow`),
      ]);
      setMember(memberRes.data.data);
      setEvents(eventsRes.data.data);
    } catch {
      setError("Unable to load this member.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const startEditing = () => {
    if (!member) return;
    setEditFullName(member.fullName);
    setEditDob(toDateInput(member.dateOfBirth));
    setEditGhanaCard(member.ghanaCardId ?? "");
    setEditPhone(member.phone ?? "");
    setEditEmail(member.email ?? "");
    setEditSchool(member.school);
    setEditing(true);
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionError("");
    try {
      await api.patch(`/members/${id}`, {
        fullName: editFullName.trim(),
        dateOfBirth: editDob || null,
        ghanaCardId: editGhanaCard.trim() || null,
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        school: editSchool.trim(),
      });
      setEditing(false);
      await load();
    } catch (err: any) {
      setActionError(err?.response?.data?.message || "Unable to save changes.");
    } finally {
      setBusy(false);
    }
  };

  const generatePassword = async () => {
    setPasswordBusy(true);
    setPasswordError("");
    try {
      const res = await api.post(`/members/${id}/password`);
      setPasswordResult(res.data.password);
      setConfirmingPasswordReset(false);
    } catch (err: any) {
      setPasswordError(err?.response?.data?.message || "Unable to generate a password.");
    } finally {
      setPasswordBusy(false);
    }
  };

  const submitAssignDistrict = async (e: FormEvent) => {
    e.preventDefault();
    if (!assignDistrictId) return;
    setAssignBusy(true);
    setAssignError("");
    try {
      await api.patch(`/members/${id}`, { districtId: Number(assignDistrictId) });
      setAssigningDistrict(false);
      setAssignDistrictId("");
      await load();
    } catch (err: any) {
      setAssignError(err?.response?.data?.message || "Unable to assign a district.");
    } finally {
      setAssignBusy(false);
    }
  };

  const startEditingSpouse = () => {
    setSpouseName(member?.spouse?.fullName ?? "");
    setSpouseDob(toDateInput(member?.spouse?.dateOfBirth ?? null));
    setSpouseGhanaCard(member?.spouse?.ghanaCardId ?? "");
    setEditingSpouse(true);
  };

  const saveSpouse = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionError("");
    try {
      await api.put(`/members/${id}/spouse`, {
        fullName: spouseName.trim(),
        dateOfBirth: spouseDob || null,
        ghanaCardId: spouseGhanaCard.trim() || null,
      });
      setEditingSpouse(false);
      await load();
    } catch (err: any) {
      setActionError(err?.response?.data?.message || "Unable to save spouse.");
    } finally {
      setBusy(false);
    }
  };

  const removeSpouse = async () => {
    setBusy(true);
    setActionError("");
    try {
      await api.delete(`/members/${id}/spouse`);
      setConfirmation(null);
      await load();
    } catch (err: any) {
      setActionError(
        err?.response?.data?.message || "Unable to remove spouse.",
      );
    } finally {
      setBusy(false);
    }
  };

  const addBeneficiary = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionError("");
    try {
      await api.post(`/members/${id}/beneficiaries`, {
        fullName: newBeneficiary.fullName.trim(),
        relationship: newBeneficiary.relationship,
        dateOfBirth: newBeneficiary.dateOfBirth || null,
      });
      setAddingBeneficiary(false);
      setNewBeneficiary({
        fullName: "",
        relationship: "CHILD",
        dateOfBirth: "",
      });
      await load();
    } catch (err: any) {
      setActionError(
        err?.response?.data?.message || "Unable to add beneficiary.",
      );
    } finally {
      setBusy(false);
    }
  };

  const removeBeneficiary = async (beneficiaryId: number) => {
    setBusy(true);
    setActionError("");
    try {
      await api.delete(`/members/${id}/beneficiaries/${beneficiaryId}`);
      setConfirmation(null);
      await load();
    } catch (err: any) {
      setActionError(
        err?.response?.data?.message || "Unable to remove beneficiary.",
      );
    } finally {
      setBusy(false);
    }
  };

  const checkReport20 = async () => {
    setBusy(true);
    setActionError("");
    setCheckResult("");
    try {
      const res = await api.post(`/members/${id}/check-report20`);
      const data = res.data.data;
      if (data.matched) {
        setCheckResult(
          data.alreadyMatched
            ? "Already matched against the latest Report 20 file."
            : `Matched against ${data.checkedImport.fileName} — status updated.`,
        );
        if (!data.alreadyMatched) await load();
      } else {
        setCheckResult(
          data.checkedImport
            ? `${data.message} (checked ${data.checkedImport.fileName})`
            : data.message,
        );
      }
    } catch (err: any) {
      setActionError(
        err?.response?.data?.message || "Unable to check against Report 20.",
      );
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!member) return;
    setBusy(true);
    setActionError("");
    try {
      await api.post(`/members/${id}/approve`);
      setConfirmation(null);
      await load();
    } catch (err: any) {
      setActionError(
        err?.response?.data?.message || "Unable to approve member.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitReturn = async (e: FormEvent) => {
    e.preventDefault();
    if (!returnNote.trim()) return;
    setBusy(true);
    setActionError("");
    try {
      await api.post(`/members/${id}/return`, { note: returnNote.trim() });
      setShowReturnForm(false);
      setReturnNote("");
      await load();
    } catch (err: any) {
      setActionError(
        err?.response?.data?.message || "Unable to return member.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitRemove = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionError("");
    try {
      await api.post(`/members/${id}/remove`, {
        reason: removeReason,
        note: removeNote.trim() || null,
      });
      setShowRemoveForm(false);
      setRemoveNote("");
      await load();
    } catch (err: any) {
      setActionError(
        err?.response?.data?.message || "Unable to remove member.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitReactivate = async () => {
    setBusy(true);
    setActionError("");
    try {
      await api.post(`/members/${id}/reactivate`, {});
      await load();
    } catch (err: any) {
      setActionError(
        err?.response?.data?.message || "Unable to reactivate member.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="member-record">
      <Link to="/members" className="member-record__back">
        &larr; All Members
      </Link>

      {loading ? (
        <div className="rounded-[12px] border border-(--border-default) bg-(--surface-raised) p-5">
          <table className="w-full">
            <tbody>
              <TableSkeleton columns={3} rows={5} />
            </tbody>
          </table>
        </div>
      ) : error || !member ? (
        <Alert tone="error">{error || "Member not found."}</Alert>
      ) : (
        <>
          <header className="member-record__header">
            <div>
              <div className="member-record__avatar">
                {member.fullName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")}
              </div>
              <div>
                <p>Member profile</p>
                <h1 className="text-[22px] font-extrabold text-[#1e2761]">
                  {member.fullName}
                </h1>
                <div className="mt-1 text-[12.5px] text-[#5b6472]">
                  Controller ID {member.controllerId} ·{" "}
                  {member.district ? (
                    <>
                      {member.district.name}, {member.district.region.name}
                    </>
                  ) : (
                    <span className="font-semibold text-[#b9791a]">No district assigned</span>
                  )}
                </div>
                {!member.district && canReview && (
                  <div className="mt-2">
                    {assigningDistrict ? (
                      <form onSubmit={submitAssignDistrict} className="flex flex-wrap items-center gap-2">
                        <Dropdown
                          className="w-64"
                          value={assignDistrictId}
                          onChange={setAssignDistrictId}
                          placeholder="Select a district…"
                          options={districts.map((d) => ({ value: String(d.id), label: `${d.name} · ${d.region.name}` }))}
                        />
                        <button
                          type="submit"
                          disabled={assignBusy || !assignDistrictId}
                          className="rounded-[9px] bg-[#1f9c7c] px-3.5 py-1.5 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {assignBusy ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssigningDistrict(false)}
                          className="text-[11.5px] font-semibold text-[#5b6472]"
                        >
                          Cancel
                        </button>
                        {assignError && (
                          <p className="w-full text-[11.5px] font-semibold text-[#c23b3b]">{assignError}</p>
                        )}
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAssigningDistrict(true)}
                        className="text-[11.5px] font-semibold text-[#1f9c7c] hover:underline"
                      >
                        Assign district
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <StatusBadge
              tone={
                member.status === "ACTIVE"
                  ? "success"
                  : member.status === "PENDING" || member.status === "RETURNED"
                    ? "warning"
                    : "danger"
              }
            >
              {member.status.charAt(0) + member.status.slice(1).toLowerCase()}
            </StatusBadge>
          </header>

          <div className="member-record__signals">
            {/* <div><span className={member.phoneVerifiedAt ? "ok" : "warn"}>{member.phoneVerifiedAt ? "✓" : "!"}</span><p>Phone verification<strong>{member.phoneVerifiedAt ? "Verified" : "Not verified"}</strong></p></div> */}
            <div>
              <span className={member.report20Matched ? "ok" : "warn"}>
                {member.report20Matched ? "✓" : "!"}
              </span>
              <p>
                Report 20
                <strong>
                  {member.report20Matched ? "Matched" : "Not matched"}
                </strong>
              </p>
            </div>
            <div>
              <span className="neutral">{member.beneficiaries.length}</span>
              <p>
                Beneficiaries
                <strong>
                  {member.beneficiaries.length === 1
                    ? "1 person"
                    : `${member.beneficiaries.length} people`}
                </strong>
              </p>
            </div>
            <div>
              <span className="neutral">{member.spouse ? "1" : "0"}</span>
              <p>
                Spouse
                <strong>{member.spouse ? "Recorded" : "Not recorded"}</strong>
              </p>
            </div>
          </div>

          {actionError && (
            <div className="mb-4 rounded-lg bg-[#fbe9e9] px-3 py-2 text-[12.5px] font-semibold text-[#c23b3b]">
              {actionError}
            </div>
          )}

          {confirmation && (
            <div className="mb-4">
              <ConfirmationPanel
                title={
                  confirmation.type === "spouse"
                    ? "Remove this spouse?"
                    : confirmation.type === "beneficiary"
                      ? `Remove ${confirmation.name}?`
                      : `Approve ${member.fullName}?`
                }
                description={
                  confirmation.type === "spouse"
                    ? "The spouse record will be removed from this member. This does not remove the member."
                    : confirmation.type === "beneficiary"
                      ? "This beneficiary will be removed from the member record."
                      : `The member's resulting status will be ${member.report20Matched ? "Active" : "Flagged"}.`
                }
                confirmLabel={
                  confirmation.type === "approve"
                    ? "Approve member"
                    : "Remove record"
                }
                busyLabel={
                  confirmation.type === "approve" ? "Approving…" : "Removing…"
                }
                tone={confirmation.type === "approve" ? "warning" : "danger"}
                confirmVariant={
                  confirmation.type === "approve" ? "primary" : "danger"
                }
                busy={busy}
                onConfirm={() =>
                  confirmation.type === "spouse"
                    ? void removeSpouse()
                    : confirmation.type === "beneficiary"
                      ? void removeBeneficiary(confirmation.id)
                      : void approve()
                }
                onCancel={() => setConfirmation(null)}
              />
            </div>
          )}

          <div className="member-record__grid">
            <div className="member-panel member-panel--details">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[15px] font-bold text-[#1e2761]">
                  Member Details
                </h2>
                {!editing && (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="text-[11.5px] font-semibold text-[#1f9c7c] hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>

              {editing ? (
                <form onSubmit={saveEdit} className="space-y-3">
                  <div>
                    <label className={labelClasses}>Full Name</label>
                    <input
                      value={editFullName}
                      onChange={(e) => setEditFullName(e.target.value)}
                      className={inputClasses}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <DatePicker
                        label="Date of Birth"
                        maxDate={new Date()}
                        value={parseISODate(editDob)}
                        onChange={(date) => setEditDob(date ? toISODate(date) : "")}
                      />
                    </div>
                    <div>
                      <label className={labelClasses}>Ghana Card ID</label>
                      <input
                        value={editGhanaCard}
                        onChange={(e) => setEditGhanaCard(e.target.value)}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className={labelClasses}>Phone</label>
                      <input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className={labelClasses}>School</label>
                      <input
                        value={editSchool}
                        onChange={(e) => setEditSchool(e.target.value)}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className={labelClasses}>Email</label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="Needed for self-service password reset"
                        className={inputClasses}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-[9px] bg-[#1f9c7c] px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="rounded-[9px] border border-[#e5e9f0] px-3.5 py-2 text-[12.5px] font-semibold text-[#5b6472]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="grid grid-cols-2 gap-4">
                  <Field
                    label="Date of Birth"
                    value={formatDate(member.dateOfBirth)}
                  />
                  <Field
                    label="Ghana Card ID"
                    value={member.ghanaCardId ?? "—"}
                  />
                  <Field label="Phone" value={member.phone ?? "—"} />
                  <Field label="Email" value={member.email ?? "—"} />
                  <Field
                    label="Phone Verified"
                    value={
                      member.phoneVerifiedAt
                        ? formatDate(member.phoneVerifiedAt)
                        : "No"
                    }
                  />
                  <Field label="School" value={member.school} />
                  <Field
                    label="Report 20 Matched"
                    value={member.report20Matched ? "Yes" : "No"}
                  />
                  <Field
                    label="Enrolled"
                    value={formatDate(member.createdAt)}
                  />
                  <Field
                    label="Enrolled By"
                    value={member.createdBy?.fullName ?? "—"}
                  />
                </dl>
              )}
            </div>

            {canReview && (
              <div className="member-panel">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[15px] font-bold text-[#1e2761]">Login &amp; Password</h2>
                </div>
                <p className="mb-3 text-[12px] leading-relaxed text-[#5b6472]">
                  Members sign in with their Controller ID and a password. Generate one here and
                  share it with the member through a secure channel — it can't be shown again after
                  this.
                </p>
                {passwordError && (
                  <p className="mb-2 text-[11.5px] font-semibold text-[#c23b3b]">{passwordError}</p>
                )}
                {passwordResult ? (
                  <div className="rounded-[9px] border border-[#a9dfcf] bg-[#dff7ee] px-3 py-2.5">
                    <div className="mb-1 text-[11px] font-semibold text-[#17805f]">
                      New password (shown once)
                    </div>
                    <code className="text-[14px] font-bold tracking-wide text-[#171b26]">
                      {passwordResult}
                    </code>
                    <button
                      type="button"
                      onClick={() => setPasswordResult(null)}
                      className="mt-2 block text-[11.5px] font-semibold text-[#17805f] hover:underline"
                    >
                      Done
                    </button>
                  </div>
                ) : confirmingPasswordReset ? (
                  <ConfirmationPanel
                    title="Generate a new password?"
                    description="This immediately replaces the member's current password (if any) and signs them out everywhere."
                    confirmLabel="Generate password"
                    busyLabel="Generating…"
                    tone="warning"
                    confirmVariant="primary"
                    busy={passwordBusy}
                    onConfirm={() => void generatePassword()}
                    onCancel={() => setConfirmingPasswordReset(false)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingPasswordReset(true)}
                    className="rounded-[9px] border border-[#e5e9f0] px-3.5 py-2 text-[12.5px] font-semibold text-[#1e2761] hover:border-[#1f9c7c]"
                  >
                    Generate / Reset Password
                  </button>
                )}
              </div>
            )}

            <div className="member-panel member-panel--spouse">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[15px] font-bold text-[#1e2761]">Spouse</h2>
                {!editingSpouse && (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={startEditingSpouse}
                      className="text-[11.5px] font-semibold text-[#1f9c7c] hover:underline"
                    >
                      {member.spouse ? "Edit" : "Add"}
                    </button>
                    {member.spouse && (
                      <button
                        type="button"
                        onClick={() => setConfirmation({ type: "spouse" })}
                        disabled={busy}
                        className="text-[11.5px] font-semibold text-[#c23b3b] hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>

              {editingSpouse ? (
                <form onSubmit={saveSpouse} className="space-y-3">
                  <div>
                    <label className={labelClasses}>Full Name</label>
                    <input
                      value={spouseName}
                      onChange={(e) => setSpouseName(e.target.value)}
                      className={inputClasses}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <DatePicker
                        label="Date of Birth"
                        maxDate={new Date()}
                        value={parseISODate(spouseDob)}
                        onChange={(date) => setSpouseDob(date ? toISODate(date) : "")}
                      />
                    </div>
                    <div>
                      <label className={labelClasses}>Ghana Card ID</label>
                      <input
                        value={spouseGhanaCard}
                        onChange={(e) => setSpouseGhanaCard(e.target.value)}
                        className={inputClasses}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-[9px] bg-[#1f9c7c] px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSpouse(false)}
                      className="rounded-[9px] border border-[#e5e9f0] px-3.5 py-2 text-[12.5px] font-semibold text-[#5b6472]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : member.spouse ? (
                <dl className="grid grid-cols-2 gap-4">
                  <Field label="Name" value={member.spouse.fullName} />
                  <Field
                    label="Date of Birth"
                    value={formatDate(member.spouse.dateOfBirth)}
                  />
                  <Field
                    label="Ghana Card ID"
                    value={member.spouse.ghanaCardId ?? "—"}
                  />
                </dl>
              ) : (
                <div className="text-[12.5px] text-[#5b6472]">
                  No spouse on record.
                </div>
              )}
            </div>

            <div className="member-panel member-panel--beneficiaries">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[15px] font-bold text-[#1e2761]">
                  Beneficiaries ({member.beneficiaries.length}/10)
                </h2>
                {!addingBeneficiary && member.beneficiaries.length < 10 && (
                  <button
                    type="button"
                    onClick={() => setAddingBeneficiary(true)}
                    className="text-[11.5px] font-semibold text-[#1f9c7c] hover:underline"
                  >
                    + Add
                  </button>
                )}
              </div>

              {addingBeneficiary && (
                <form
                  onSubmit={addBeneficiary}
                  className="mb-4 grid grid-cols-1 gap-3 rounded-[10px] border border-[#e5e9f0] p-4 sm:grid-cols-4"
                >
                  <div>
                    <label className={labelClasses}>Full Name</label>
                    <input
                      value={newBeneficiary.fullName}
                      onChange={(e) =>
                        setNewBeneficiary((p) => ({
                          ...p,
                          fullName: e.target.value,
                        }))
                      }
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>Relationship</label>
                    <Dropdown
                      value={newBeneficiary.relationship}
                      onChange={(value) =>
                        setNewBeneficiary((p) => ({
                          ...p,
                          relationship: value,
                        }))
                      }
                      options={RELATIONSHIPS.map((r) => ({ value: r, label: r }))}
                    />
                  </div>
                  <div>
                    <DatePicker
                      label="Date of Birth"
                      maxDate={new Date()}
                      value={parseISODate(newBeneficiary.dateOfBirth)}
                      onChange={(date) =>
                        setNewBeneficiary((p) => ({
                          ...p,
                          dateOfBirth: date ? toISODate(date) : "",
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-[9px] bg-[#1f9c7c] px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingBeneficiary(false)}
                      className="rounded-[9px] border border-[#e5e9f0] px-3.5 py-2 text-[12.5px] font-semibold text-[#5b6472]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {member.beneficiaries.length === 0 ? (
                <div className="text-[12.5px] text-[#5b6472]">
                  No beneficiaries on record.
                </div>
              ) : (
                <table className="member-beneficiary-table">
                  <thead>
                    <tr className="border-b border-[#e5e9f0] text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
                      <th className="py-2">Name</th>
                      <th className="py-2">Relationship</th>
                      <th className="py-2">Date of Birth</th>
                      <th className="py-2">Trustee</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {member.beneficiaries.map((b) => (
                      <tr
                        key={b.id}
                        className="border-b border-[#e5e9f0] last:border-0"
                      >
                        <td className="py-2 text-[#171b26]">{b.fullName}</td>
                        <td className="py-2 text-[#5b6472]">
                          {b.relationship}
                        </td>
                        <td className="py-2 text-[#5b6472]">
                          {formatDate(b.dateOfBirth)}
                        </td>
                        <td className="py-2 text-[#5b6472]">
                          {b.trusteeName ? (
                            <>
                              <strong className="member-trustee-name">
                                {b.trusteeName}
                              </strong>
                              <small className="member-trustee-card">
                                {b.trusteeGhanaCardId || "No Ghana Card"}
                              </small>
                            </>
                          ) : (
                            "Not required"
                          )}
                        </td>
                        <td className="py-2 text-right">
                          {member.beneficiaries.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmation({
                                  type: "beneficiary",
                                  id: b.id,
                                  name: b.fullName,
                                })
                              }
                              disabled={busy}
                              className="text-[11.5px] font-semibold text-[#c23b3b] hover:underline"
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div id="workflow" className="member-panel member-panel--workflow">
              <div className="member-workflow-heading">
                <div>
                  <h2>Workflow</h2>
                  <p>
                    Review eligibility, update status, and view the decision
                    history.
                  </p>
                </div>
                <span
                  className={`member-record__status member-record__status--${member.status.toLowerCase()}`}
                >
                  {member.status}
                </span>
              </div>

              {member.missingFromReport20At && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-[#f0c96b] bg-[#fdf6e3] px-3.5 py-2.5 text-[12.5px] text-[#7a5c00]">
                  <span>
                    Inactive since {formatDate(member.missingFromReport20At)} —
                    not found in the most recently reconciled Report 20 file.
                    Portal sign-in is blocked while inactive. This clears
                    automatically and sign-in is restored if they reappear in a
                    future upload — otherwise, review whether to remove them.
                  </span>
                  {canReview && member.status !== "REMOVED" && (
                    <div className="flex shrink-0 gap-2">
                      {member.status === "INACTIVE" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={submitReactivate}
                          className="rounded-[9px] border border-[#f0c96b] bg-white px-3 py-1.5 text-[11.5px] font-bold text-[#7a5c00] hover:bg-[#fdf6e3] disabled:opacity-60"
                        >
                          Reactivate
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowRemoveForm(true)}
                        className="rounded-[9px] border border-[#f0c96b] bg-white px-3 py-1.5 text-[11.5px] font-bold text-[#7a5c00] hover:bg-[#fdf6e3]"
                      >
                        Review for removal
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="mb-5 flex flex-wrap gap-2">
                {!member.report20Matched && (
                  <button
                    type="button"
                    onClick={checkReport20}
                    disabled={busy}
                    className="rounded-[9px] border border-[#e5e9f0] px-3.5 py-2 text-[12.5px] font-semibold text-[#1e2761] disabled:opacity-60"
                  >
                    Check against Report 20
                  </button>
                )}
                {canReview &&
                  (["PENDING", "RETURNED"].includes(member.status) ||
                    (member.status === "FLAGGED" &&
                      member.report20Matched)) && (
                    <button
                      type="button"
                      onClick={() => setConfirmation({ type: "approve" })}
                      disabled={busy}
                      className="rounded-[9px] bg-[#1f9c7c] px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
                    >
                      {member.report20Matched
                        ? "Approve → Active"
                        : "Approve → Flagged"}
                    </button>
                  )}
                {canReview &&
                  ["PENDING", "FLAGGED"].includes(member.status) && (
                    <button
                      type="button"
                      onClick={() => setShowReturnForm((v) => !v)}
                      className="rounded-[9px] bg-[#fbf0dd] px-3.5 py-2 text-[12.5px] font-bold text-[#b9791a]"
                    >
                      Return
                    </button>
                  )}
                {canReview && member.status !== "REMOVED" && (
                  <button
                    type="button"
                    onClick={() => setShowRemoveForm((v) => !v)}
                    className="rounded-[9px] bg-[#fbe9e9] px-3.5 py-2 text-[12.5px] font-bold text-[#c23b3b]"
                  >
                    Remove
                  </button>
                )}
              </div>

              {checkResult && (
                <div className="-mt-3 mb-5 rounded-lg bg-[#eef0fa] px-3 py-2 text-[12px] font-semibold text-[#1e2761]">
                  {checkResult}
                </div>
              )}

              {canReview && !member.report20Matched && (
                <>
                  {["PENDING", "RETURNED"].includes(member.status) && (
                    <div className="-mt-3 mb-5 text-[11.5px] text-[#b9791a]">
                      This member hasn't matched Report 20, so approving will
                      set the status to Flagged rather than Active.
                    </div>
                  )}
                  {member.status === "FLAGGED" && (
                    <div className="-mt-3 mb-5 text-[11.5px] text-[#b9791a]">
                      This member is flagged and still isn't matched against
                      Report 20 — use "Check against Report 20" above, or re-run
                      reconciliation on the latest upload, and Approve will
                      become available.
                    </div>
                  )}
                </>
              )}

              {showReturnForm && (
                <form
                  onSubmit={submitReturn}
                  className="mb-5 rounded-[10px] border border-[#e5e9f0] p-4"
                >
                  <label className={labelClasses}>Return Note</label>
                  <textarea
                    value={returnNote}
                    onChange={(e) => setReturnNote(e.target.value)}
                    rows={2}
                    className={inputClasses}
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="submit"
                      disabled={busy || !returnNote.trim()}
                      className="rounded-[9px] bg-[#b9791a] px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
                    >
                      Confirm Return
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReturnForm(false)}
                      className="rounded-[9px] border border-[#e5e9f0] px-3.5 py-2 text-[12.5px] font-semibold text-[#5b6472]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {showRemoveForm && (
                <form
                  onSubmit={submitRemove}
                  className="mb-5 rounded-[10px] border border-[#e5e9f0] p-4"
                >
                  <label className={labelClasses}>Reason</label>
                  <Dropdown
                    value={removeReason}
                    onChange={setRemoveReason}
                    options={REMOVAL_REASONS.map((r) => ({ value: r, label: r }))}
                  />
                  <label className={`${labelClasses} mt-3`}>
                    Note{" "}
                    {removeReason === "OTHER" ? "(required)" : "(optional)"}
                  </label>
                  <textarea
                    value={removeNote}
                    onChange={(e) => setRemoveNote(e.target.value)}
                    rows={2}
                    className={inputClasses}
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="submit"
                      disabled={
                        busy || (removeReason === "OTHER" && !removeNote.trim())
                      }
                      className="rounded-[9px] bg-[#c23b3b] px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
                    >
                      Confirm Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRemoveForm(false)}
                      className="rounded-[9px] border border-[#e5e9f0] px-3.5 py-2 text-[12.5px] font-semibold text-[#5b6472]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {events.length === 0 ? (
                <div className="text-[12.5px] text-[#5b6472]">
                  No workflow events yet.
                </div>
              ) : (
                <ul className="member-workflow-history">
                  {events.map((event) => (
                    <li key={event.id} className="py-2.5">
                      <div className="flex items-center justify-between text-[12.5px]">
                        <span className="font-semibold text-[#171b26]">
                          {event.action}: {event.fromStatus} &rarr;{" "}
                          {event.toStatus}
                        </span>
                        <span className="text-[11px] text-[#5b6472]">
                          {formatDate(event.createdAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-[#5b6472]">
                        {event.performedBy.fullName}
                        {event.reason ? ` · ${event.reason}` : ""}
                        {event.note ? ` · ${event.note}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
