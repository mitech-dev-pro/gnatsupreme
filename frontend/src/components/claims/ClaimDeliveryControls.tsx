import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import MankradoHistory from "./MankradoHistory";
import { getApiError } from "@/lib/errorExtract";
import type { ClaimStageInput } from "@/lib/claimStatus";

export default function ClaimDeliveryControls({
  claim,
  staffId,
  onSent,
}: {
  claim: ClaimStageInput & { id: number };
  staffId: string;
  onSent: () => void | Promise<void>;
}) {
  const [checked, setChecked] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const identity = `${claim.id}:${staffId}:${claim.deliveryState}`;
  const active = useRef(identity);
  useEffect(() => {
    active.current = identity;
    setChecked(false);
    setAcknowledged(false);
    setError("");
    setBusy(false);
    return () => {
      active.current = "";
    };
  }, [identity]);
  const eligible =
    claim.provider === "Claims System" &&
    claim.status === "PENDING" &&
    ["NOT_SENT", "FAILED", "UNKNOWN"].includes(claim.deliveryState ?? "") &&
    (claim.source === "STAFF" || Boolean(claim.reviewedAt));
  if (!eligible) return null;
  const unknown = claim.deliveryState === "UNKNOWN";
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post(
        `/claims/submissions/${claim.id}/send`,
        unknown ? { historyChecked: true } : {},
      );
      if (active.current === identity) await onSent();
    } catch (caught) {
      if (active.current === identity)
        setError(getApiError(caught)?.message || "Delivery could not be started.");
    } finally {
      if (active.current === identity) {
        setBusy(false);
        setChecked(false);
        setAcknowledged(false);
        setAttempt((value) => value + 1);
      }
    }
  };
  return (
    <div className="mb-4">
      {unknown && (
        <>
          <p className="text-sm text-text-muted">
            The claim may already have arrived. Check history before retrying. This reduces
            duplicate risk but cannot guarantee insurer-side deduplication.
          </p>
          <MankradoHistory
            key={`${identity}:${attempt}`}
            staffId={staffId}
            manual
            onChecked={(success) => {
              setChecked(success);
              setAcknowledged(false);
            }}
          />
          <label className="my-3 flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              disabled={!checked || busy}
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            I checked this member’s Mankrado history and found no matching claim.
          </label>
        </>
      )}
      <Button
        loading={busy}
        variant={unknown ? "secondary" : "primary"}
        disabled={unknown && (!checked || !acknowledged)}
        onClick={() => void send()}
      >
        {claim.deliveryState === "NOT_SENT" ? "Send saved claim" : "Retry submission"}
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
