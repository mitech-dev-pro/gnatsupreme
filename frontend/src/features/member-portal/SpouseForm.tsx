import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { applyGhanaCardIdChange, GHANA_CARD_ID_PREFIX, ghanaCardIdOrNull } from "@/lib/ghanaCardId";
import { useId, useState, type ChangeEvent, type FormEvent } from "react";
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
  const formId = useId();
  const [fullName, setFullName] = useState(spouse?.fullName ?? "");
  const [ghanaCardId, setGhanaCardId] = useState(spouse?.ghanaCardId ?? GHANA_CARD_ID_PREFIX);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [certificateBusy, setCertificateBusy] = useState(false);
  const [certificateError, setCertificateError] = useState("");
  const [certificateUploaded, setCertificateUploaded] = useState(false);

  const uploadCertificate = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setCertificateBusy(true);
    setCertificateError("");
    try {
      const body = new FormData();
      body.append("file", file);
      await api.post("/member-portal/spouse/marriage-certificate", body);
      setCertificateUploaded(true);
    } catch (err: unknown) {
      setCertificateError(
        getApiError(err)?.message || "Unable to upload the marriage certificate.",
      );
    } finally {
      setCertificateBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/member-portal/change-requests", {
        type: "SPOUSE",
        proposedData: {
          fullName: fullName.trim(),
          ghanaCardId: ghanaCardIdOrNull(ghanaCardId.trim()),
        },
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
    <form
      onSubmit={submit}
      className="mt-3 space-y-3 rounded-xl border border-border-default bg-surface-hover p-4"
    >
      <div>
        <label htmlFor={`${formId}-field-1`} className={labelClasses}>
          Full Name
        </label>
        <input
          id={`${formId}-field-1`}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={inputClasses}
          required
          minLength={2}
        />
      </div>
      <div>
        <label htmlFor={`${formId}-field-2`} className={labelClasses}>
          Ghana Card ID
        </label>
        <input
          id={`${formId}-field-2`}
          value={ghanaCardId}
          onChange={(e) => setGhanaCardId(applyGhanaCardIdChange(e))}
          placeholder="GHA-000000000-0"
          className={inputClasses}
        />
      </div>
      <div>
        <label htmlFor={`${formId}-field-3`} className={labelClasses}>
          Note (optional)
        </label>
        <textarea
          id={`${formId}-field-3`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          className={inputClasses}
        />
      </div>
      {spouse ? (
        <div className="rounded-lg border border-border-default p-3">
          <label className={labelClasses}>Marriage certificate</label>
          <p className="mb-2 text-xs text-text-muted">
            Upload a copy for your district office to verify. Accepted: PDF, JPEG, PNG, WebP.
          </p>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => void uploadCertificate(e)}
            disabled={certificateBusy}
            className="block w-full text-xs"
          />
          {certificateBusy && <p className="mt-1 text-xs text-text-muted">Uploading…</p>}
          {certificateUploaded && !certificateBusy && (
            <p className="mt-1 text-xs font-semibold text-success">
              Certificate uploaded. You can upload another file to replace it.
            </p>
          )}
          {certificateError && (
            <p role="alert" className="mt-1 text-xs font-semibold text-danger">
              {certificateError}
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-xs text-text-muted">
          You'll be able to upload a marriage certificate once this spouse request is approved.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger"
        >
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
          disabled={busy}
          className="rounded-lg border border-border-default px-4 py-2 text-sm font-semibold text-text-strong"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
