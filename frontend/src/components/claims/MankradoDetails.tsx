import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import Button from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import StatusBadge from "@/components/ui/StatusBadge";
import { claimStatusTone } from "@/lib/claimStatus";

import type { AssessmentUpdate, MankradoAssessment } from "@/features/claims/assessment.types";

export default function MankradoDetails({
  externalId,
  savedAssessment = null,
  lastSyncedAt = null,
  onUpdated,
  endpoint,
}: {
  externalId: string | null;
  savedAssessment?: MankradoAssessment | null;
  lastSyncedAt?: string | null;
  onUpdated?: (result: AssessmentUpdate) => void;
  endpoint?: string;
}) {
  const requestIdentity = `${endpoint ?? "staff"}:${externalId ?? ""}`;
  const [state, setState] = useState({
    id: requestIdentity,
    details: savedAssessment,
    checkedAt: lastSyncedAt,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const updatedRef = useRef(onUpdated);
  useEffect(() => {
    updatedRef.current = onUpdated;
  }, [onUpdated]);
  const savedRef = useRef({ savedAssessment, lastSyncedAt });
  useEffect(() => {
    savedRef.current = { savedAssessment, lastSyncedAt };
  }, [savedAssessment, lastSyncedAt]);
  const details = state.id === requestIdentity ? state.details : savedAssessment;
  const checkedAt = state.id === requestIdentity ? state.checkedAt : lastSyncedAt;
  useEffect(() => {
    setState((previous) =>
      previous.id === requestIdentity
        ? previous
        : {
            id: requestIdentity,
            details: savedRef.current.savedAssessment,
            checkedAt: savedRef.current.lastSyncedAt,
          },
    );
    setError("");
    if (!externalId) {
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    api
      .get(endpoint ?? `/claims/claimdetails/${encodeURIComponent(externalId)}`, {
        signal: controller.signal,
      })
      .then((response) => {
        if (!controller.signal.aborted) {
          const result = response.data.data as AssessmentUpdate;
          setState({ id: requestIdentity, details: result, checkedAt: result.lastSyncedAt });
          updatedRef.current?.(result);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Could not refresh");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [externalId, refresh, endpoint, requestIdentity]);

  // The provider date has no timezone. Preserve its wall-clock time without browser conversion.
  const date = details?.claimDate ? details.claimDate.replace(/\.\d+$/, "") : "Not provided";
  const fields = details
    ? [
        ["Claim number", details.claimNumber],
        ["Name on Claims Portal", details.name || "Not provided"],
        ["Claim date", date],
        [
          "Amount payable — reported by Claims Portal",
          details.amountPayable == null
            ? "Not provided by Claims Portal"
            : formatCurrency(details.amountPayable),
        ],
        ["Rejection reason", details.rejectReason?.trim() || "None reported"],
      ]
    : [];
  return (
    <section
      className="my-5 border-t border-border-default pt-5"
      aria-labelledby="mankrado-details-title"
      aria-busy={busy}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="mankrado-details-title" className="text-lg font-bold text-text-strong">
          Claims Portal assessment
        </h2>
        {externalId && (
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Refresh details
          </Button>
        )}
      </div>
      {!externalId && (
        <p className="text-sm text-text-muted">
          Assessment information becomes available after Claims Portal confirms receipt.
        </p>
      )}
      {checkedAt && (
        <p className="mb-3 text-xs text-text-muted">
          Last checked: {new Date(checkedAt).toLocaleString()}. This records the last successful
          retrieval.
        </p>
      )}
      {error && (
        <Alert tone="warning">
          {details
            ? "Could not refresh; showing the last saved assessment."
            : "Claims Portal assessment is unavailable. Your submitted information remains available."}
        </Alert>
      )}
      {busy && (
        <p role="status" className="text-sm text-text-muted">
          Loading Claims Portal details…
        </p>
      )}
      {details && (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-text-muted">Claims Portal status</dt>
            <dd className="mt-1">
              <StatusBadge tone={claimStatusTone(details.status)}>{details.status}</StatusBadge>
            </dd>
          </div>
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold text-text-muted">{label}</dt>
              <dd className="mt-1 wrap-break-word text-sm font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
