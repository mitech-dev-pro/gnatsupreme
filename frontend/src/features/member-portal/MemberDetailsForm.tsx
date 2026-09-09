import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { applyGhanaCardIdChange } from "@/lib/ghanaCardId";
import { useState, type FormEvent } from "react";
import { inputClasses, labelClasses, type MemberProfile } from "./MemberHome.shared";

export function MemberDetailsForm({
  profile,
  onClose,
  onSubmitted,
}: {
  profile: MemberProfile;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [fullName, setFullName] = useState(profile.fullName);
  const [ghanaCardId, setGhanaCardId] = useState(profile.ghanaCardId ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [school, setSchool] = useState(profile.school);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const changed =
    fullName.trim() !== profile.fullName ||
    ghanaCardId.trim() !== (profile.ghanaCardId ?? "") ||
    phone.trim() !== (profile.phone ?? "") ||
    school.trim() !== profile.school;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!changed) return;
    const proposedData: Record<string, string | null> = {};
    if (fullName.trim() !== profile.fullName) proposedData.fullName = fullName.trim();
    if (ghanaCardId.trim() !== (profile.ghanaCardId ?? ""))
      proposedData.ghanaCardId = ghanaCardId.trim() || null;
    if (phone.trim() !== (profile.phone ?? "")) proposedData.phone = phone.trim() || null;
    if (school.trim() !== profile.school) proposedData.school = school.trim();
    setBusy(true);
    setError("");
    try {
      await api.post("/member-portal/change-requests", {
        type: "MEMBER_DETAILS",
        proposedData,
        requestNote: note.trim() || undefined,
      });
      await onSubmitted();
      onClose();
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to submit this request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-t border-border-default px-5 py-5 sm:px-6">
      <div className="mb-4">
        <h3 className="text-base font-bold text-text-strong">Request profile changes</h3>
        <p className="mt-0.5 text-xs text-text-muted">
          Your current details remain active until an administrator approves this request.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="member-profile-name" className={labelClasses}>
            Full legal name
          </label>
          <input
            id="member-profile-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className={inputClasses}
            minLength={2}
            required
          />
        </div>
        <div>
          <label htmlFor="member-profile-card" className={labelClasses}>
            Ghana Card ID
          </label>
          <input
            id="member-profile-card"
            value={ghanaCardId}
            onChange={(event) => setGhanaCardId(applyGhanaCardIdChange(event))}
            placeholder="GHA-000000000-0"
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="member-profile-phone" className={labelClasses}>
            Phone number
          </label>
          <input
            id="member-profile-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className={inputClasses}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="member-profile-school" className={labelClasses}>
            School or institution
          </label>
          <input
            id="member-profile-school"
            value={school}
            onChange={(event) => setSchool(event.target.value)}
            className={inputClasses}
            minLength={2}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="member-profile-note" className={labelClasses}>
            Reason or note (optional)
          </label>
          <textarea
            id="member-profile-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={500}
            className={inputClasses}
          />
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger"
        >
          {error}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !changed}
          className="min-h-10 rounded-lg bg-action-primary px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Submit for review"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="min-h-10 rounded-lg border border-border-default px-4 text-xs font-semibold text-text-strong"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
