import { useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import DatePicker from "@/components/ui/DatePicker";
import Dropdown from "@/components/ui/Dropdown";
import { Alert } from "@/components/ui/Feedback";
import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { applyGhanaCardIdChange, ghanaCardIdOrNull } from "@/lib/ghanaCardId";
import { parseISODate, toISODate, isMinor } from "@/lib/utils";
import {
  type ChangeRequest,
  REQUEST_FIELD_LABELS,
  RELATIONSHIPS,
  inputClasses,
  labelClasses,
} from "./MemberHome.shared";

export default function ChangeRequestCorrection({
  request,
  onClose,
  onSubmitted,
}: {
  request: ChangeRequest;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}) {
  const allowed =
    request.type === "MEMBER_DETAILS"
      ? ["fullName", "ghanaCardId", "phone", "school"]
      : request.type === "SPOUSE"
        ? ["fullName", "ghanaCardId"]
        : request.type === "BENEFICIARY_REMOVE"
          ? []
          : ["fullName", "relationship", "dateOfBirth", "trusteeName", "trusteeGhanaCardId"];
  const fields =
    request.type === "MEMBER_DETAILS"
      ? allowed.filter((key) => Object.hasOwn(request.proposedData ?? {}, key))
      : allowed;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((key) => [
        key,
        String(request.proposedData?.[key] ?? "").slice(0, key === "dateOfBirth" ? 10 : undefined),
      ]),
    ),
  );
  const [note, setNote] = useState(request.requestNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (key: string, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const proposedData = Object.fromEntries(
        fields.map((key) => [
          key,
          key.toLowerCase().includes("ghanacard")
            ? ghanaCardIdOrNull(values[key]?.trim() ?? "")
            : values[key]?.trim() || null,
        ]),
      );
      await api.patch(`/member-portal/change-requests/${request.id}/resubmit`, {
        type: request.type,
        ...(request.targetBeneficiaryId
          ? { targetBeneficiaryId: request.targetBeneficiaryId }
          : {}),
        ...(fields.length ? { proposedData } : {}),
        requestNote: note.trim(),
        expectedUpdatedAt: request.updatedAt,
      });
      await onSubmitted();
      onClose();
    } catch (cause) {
      const detail = getApiError(cause);
      setError(
        detail?.errors?.map((item) => item.message).join(" ") ||
          detail?.message ||
          "Unable to resubmit. Your corrections are still here.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={submit}
      className="mt-4 space-y-4 border-t border-border-default pt-4"
      aria-label={`Correct request ${request.id}`}
    >
      <h3 className="text-base font-bold text-ink">Correct and resubmit</h3>
      <p className="max-w-prose text-sm text-text-muted">
        Update the requested details below. Your member record changes only after staff approval.
      </p>
      {fields.length === 0 && (
        <p className="text-sm text-text-muted">
          This still requests removal of the same beneficiary. Use your note to address the
          reviewer’s concern.
        </p>
      )}
      <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="sr-only">Corrected details</legend>
        {fields.map((key) => {
          const label = REQUEST_FIELD_LABELS[key] ?? key;
          const id = `correction-${request.id}-${key}`;
          if (key === "dateOfBirth")
            return (
              <DatePicker
                key={key}
                label={label}
                value={parseISODate(values[key])}
                maxDate={new Date()}
                onChange={(date) => update(key, date ? toISODate(date) : "")}
              />
            );
          return (
            <div key={key} className="min-w-0">
              <label htmlFor={id} className={labelClasses}>
                {label}
              </label>
              {key === "relationship" ? (
                <Dropdown
                  id={id}
                  aria-label={label}
                  value={values[key]}
                  onChange={(value) => update(key, value)}
                  options={[...new Set([...RELATIONSHIPS, values[key]].filter(Boolean))].map(
                    (value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }),
                  )}
                />
              ) : (
                <input
                  id={id}
                  className={inputClasses}
                  type={key === "phone" ? "tel" : "text"}
                  value={values[key]}
                  required={
                    ["fullName", "school"].includes(key) ||
                    (key === "trusteeName" && isMinor(values.dateOfBirth))
                  }
                  minLength={
                    ["fullName", "school"].includes(key) ? 2 : key === "phone" ? 7 : undefined
                  }
                  maxLength={key === "school" ? 160 : key === "phone" ? 30 : 120}
                  pattern={
                    key.toLowerCase().includes("ghanacard")
                      ? "(GHA-|GHA-[0-9]{9}-[0-9])"
                      : undefined
                  }
                  placeholder={
                    key.toLowerCase().includes("ghanacard") ? "GHA-000000000-0" : undefined
                  }
                  onChange={(event) =>
                    update(
                      key,
                      key.toLowerCase().includes("ghanacard")
                        ? applyGhanaCardIdChange(event)
                        : event.target.value,
                    )
                  }
                />
              )}
            </div>
          );
        })}
        <div className="sm:col-span-2">
          <label htmlFor={`correction-note-${request.id}`} className={labelClasses}>
            Your note (optional)
          </label>
          <textarea
            id={`correction-note-${request.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            rows={3}
            className={inputClasses}
          />
        </div>
      </fieldset>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy} loadingLabel="Resubmitting…">
          Resubmit for review
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Keep returned request
        </Button>
      </div>
    </form>
  );
}
