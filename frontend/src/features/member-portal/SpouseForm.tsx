import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { applyGhanaCardIdChange } from "@/lib/ghanaCardId";
import { useState, type FormEvent } from "react";
import { inputClasses, labelClasses, type Spouse } from "./MemberHome.shared";

export function SpouseForm({
  spouse,
  onClose,
  onSubmitted,
}: {
  spouse: Spouse | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [fullName, setFullName] = useState(spouse?.fullName ?? "");
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
          ghanaCardId: ghanaCardId.trim() || null,
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
        <label className={labelClasses}>Ghana Card ID</label>
        <input
          value={ghanaCardId}
          onChange={(e) => setGhanaCardId(applyGhanaCardIdChange(e))}
          placeholder="GHA-000000000-0"
          className={inputClasses}
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
