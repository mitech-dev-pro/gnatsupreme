import DatePicker from "@/components/ui/DatePicker";
import Dropdown from "@/components/ui/Dropdown";
import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { isMinor, parseISODate, toISODate } from "@/lib/utils";
import { useState, type FormEvent } from "react";
import {
  type Beneficiary,
  inputClasses,
  labelClasses,
  RELATIONSHIPS,
  toDateInput,
} from "./MemberHome.shared";

export function BeneficiaryForm({
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
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const minor = isMinor(dateOfBirth);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (minor && !trusteeName.trim()) {
      setError("A trustee name is required for a beneficiary under 18.");
      return;
    }
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
        },
        requestNote: note.trim() || undefined,
      });
      onSubmitted();
      onClose();
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to submit this request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-3 space-y-3 rounded-xl border border-border-default bg-surface-hover p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClasses}>Full Name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClasses}
            required
            minLength={2}
          />
        </div>
        <div>
          <label className={labelClasses}>Relationship</label>
          <Dropdown
            value={relationship}
            onChange={setRelationship}
            options={RELATIONSHIPS.map((r) => ({
              value: r,
              label: r.charAt(0) + r.slice(1).toLowerCase(),
            }))}
          />
        </div>
      </div>
      <div className="max-w-52">
        <DatePicker
          label="Date of Birth"
          maxDate={new Date()}
          value={parseISODate(dateOfBirth)}
          onChange={(date) => setDateOfBirth(date ? toISODate(date) : "")}
        />
      </div>
      {minor && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs font-semibold text-warning-accent">
          This beneficiary is under 18 — a trustee name is required.
        </p>
      )}
      <div>
        <label className={labelClasses}>Trustee Name {minor ? "" : "(optional)"}</label>
        <input
          value={trusteeName}
          onChange={(e) => setTrusteeName(e.target.value)}
          className={inputClasses}
          required={minor}
        />
      </div>
      <div>
        <label className={labelClasses}>Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          className={inputClasses}
        />
      </div>
      {error && (
        <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || fullName.trim().length < 2}
          className="rounded-lg bg-action-primary px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Submitting…" : "Submit for review"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border-default px-4 py-2 text-sm font-semibold text-text-strong"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
