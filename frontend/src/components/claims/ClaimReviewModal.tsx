import { useRef, useState } from "react";
import Dialog from "@/components/ui/Dialog";
import { Alert } from "@/components/ui/Feedback";
import { ClaimReviewControls, type ClaimDecision } from "@/features/claims/ClaimReviewControls";
import { reviewClaim } from "@/features/claims/claims.api";
import { getApiError } from "@/lib/errorExtract";
import type { ClaimSubmission } from "./ClaimsTable";

export default function ClaimReviewModal({
  claim,
  onClose,
  onReviewed,
}: {
  claim: ClaimSubmission;
  onClose: () => void;
  onReviewed: () => void | Promise<void>;
}) {
  const [decision, setDecision] = useState<ClaimDecision | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const submit = async () => {
    if (saving.current || !decision || (decision !== "APPROVE" && !note.trim())) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await reviewClaim(claim.id, decision, note);
    } catch (caught) {
      setError(
        getApiError(caught)?.message || "The review could not be completed. Please try again.",
      );
      saving.current = false;
      setBusy(false);
      return;
    }
    saving.current = false;
    setBusy(false);
    onClose();
    void onReviewed();
  };
  return (
    <Dialog
      title="Review claim"
      closeLabel="Close review"
      busy={busy}
      onClose={onClose}
      description={
        <>
          <p>
            {claim.member.fullName} · CLM-{String(claim.id).padStart(6, "0")}
          </p>
          <p className="mt-1 text-xs">
            {claim.claimType?.replaceAll("_", " ")} · Covered person:{" "}
            {claim.claimantName || claim.member.fullName}
          </p>
        </>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <ClaimReviewControls
        decision={decision}
        note={note}
        busy={busy}
        onDecision={setDecision}
        onNote={setNote}
        onCancel={onClose}
        onConfirm={() => void submit()}
      />
    </Dialog>
  );
}
