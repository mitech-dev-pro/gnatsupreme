import Button from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/FormField";
import { cn } from "@/lib/utils";

export type ClaimDecision = "APPROVE" | "RETURN" | "REJECT";
const decisions = [
  { value: "APPROVE", label: "Approve", selected: "border-success bg-success-soft text-success" },
  {
    value: "RETURN",
    label: "Return for correction",
    selected: "border-warning bg-warning-soft text-warning",
  },
  { value: "REJECT", label: "Reject", selected: "border-danger bg-danger-soft text-danger" },
] as const;

type Props = {
  decision: ClaimDecision | null;
  note: string;
  busy: boolean;
  onDecision: (value: ClaimDecision) => void;
  onNote: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ClaimReviewControls({
  decision,
  note,
  busy,
  onDecision,
  onNote,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {decisions.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={decision === item.value}
            onClick={() => onDecision(item.value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-bold",
              decision === item.value ? item.selected : "border-border-default text-ink",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {decision && (
        <div className="mt-3">
          <TextareaField
            label="Review note"
            required={decision !== "APPROVE"}
            hint={decision === "APPROVE" ? "Optional" : "Required"}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(event) => onNote(event.target.value)}
            placeholder={
              decision === "APPROVE"
                ? "Add a note if needed"
                : "Explain the decision and what the member should do next"
            }
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={busy}
              loadingLabel="Saving…"
              disabled={decision !== "APPROVE" && !note.trim()}
              onClick={onConfirm}
            >
              Confirm {decision.toLowerCase()}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
