import type { ReactNode } from "react";
import Dialog from "./Dialog";
import Button from "./Button";
import { Alert } from "./Feedback";
import { TextareaField } from "./FormField";

export default function ReviewDecisionDialog({
  title,
  description,
  help,
  decision,
  note,
  onNote,
  busy,
  error,
  onClose,
  onConfirm,
  minNoteLength = 1,
}: {
  title: string;
  description: ReactNode;
  help: string;
  decision: "APPROVE" | "RETURN" | "REJECT";
  note: string;
  onNote: (value: string) => void;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
  minNoteLength?: number;
}) {
  return (
    <Dialog title={title} description={description} busy={busy} onClose={onClose}>
      <p className="mb-4 text-sm leading-relaxed text-text-muted">{help}</p>
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <TextareaField
        label="Review note"
        required={decision !== "APPROVE"}
        hint={
          decision === "APPROVE" ? "Optional" : "Required — explain what the member should do next."
        }
        value={note}
        onChange={(event) => onNote(event.target.value)}
        rows={3}
        maxLength={500}
        disabled={busy}
      />
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={decision === "REJECT" ? "danger" : "primary"}
          loading={busy}
          loadingLabel="Saving…"
          disabled={decision !== "APPROVE" && note.trim().length < minNoteLength}
          onClick={onConfirm}
        >
          Confirm {decision.toLowerCase()}
        </Button>
      </div>
    </Dialog>
  );
}
