import { useEffect, useState } from "react";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import Button from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import StatusBadge from "@/components/ui/StatusBadge";

type Details = {
  claimNumber: string;
  name: string | null;
  claimDate: string | null;
  amountPayable: string | null;
  status: string;
  rejectReason: string | null;
};

export default function MankradoDetails({ externalId }: { externalId: string | null }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setDetails(null);
    setError("");
    if (!externalId) {
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    api
      .get(`/claims/claimdetails/${encodeURIComponent(externalId)}`, {
        signal: controller.signal,
      })
      .then((response) => {
        if (!controller.signal.aborted) setDetails(response.data.data);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Mankrado details could not be loaded. Your saved claim details are available below.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [externalId, refresh]);

  // The provider date has no timezone. Preserve its wall-clock time without browser conversion.
  const date = details?.claimDate ? details.claimDate.replace(/\.\d+$/, "") : "Not provided";
  const fields = details
    ? [
        ["Claim number", details.claimNumber],
        ["Name on Mankrado", details.name || "Not provided"],
        ["Claim date", date],
        [
          "Amount payable (GHS)",
          details.amountPayable === null ? "Not provided" : formatCurrency(details.amountPayable),
        ],
        ["Rejection reason", details.rejectReason?.trim() || "None reported"],
      ]
    : [];
  return (
    <section
      className="mb-5 rounded-xl border border-border-default bg-(--surface-raised) p-5"
      aria-labelledby="mankrado-details-title"
      aria-busy={busy}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="mankrado-details-title" className="text-lg font-bold text-text-strong">
          Mankrado assessment
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
          Mankrado details will appear once this claim has an external reference.
        </p>
      )}
      {error && <Alert tone="warning">{error}</Alert>}
      {busy && (
        <p role="status" className="text-sm text-text-muted">
          Loading Mankrado details…
        </p>
      )}
      {details && (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-text-muted">Mankrado status</dt>
            <dd className="mt-1">
              <StatusBadge tone="info">{details.status}</StatusBadge>
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
