import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import Button from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";

type ExternalClaim = {
  id: string;
  claimNumber: string;
  name: string | null;
  claimDate: string | null;
  amountPayable: string | null;
  status: string;
};
export default function MankradoHistory({
  staffId,
  manual = false,
  onChecked,
}: {
  staffId: string;
  externalId?: string | null;
  manual?: boolean;
  onChecked?: (success: boolean) => void;
}) {
  const [history, setHistory] = useState<{ staffId: string; items: ExternalClaim[] } | null>(null);
  const items = history?.staffId === staffId ? history.items : null;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const checkedRef = useRef(onChecked);
  useEffect(() => {
    checkedRef.current = onChecked;
  }, [onChecked]);
  useEffect(() => {
    if (manual && refresh === 0) return;
    const controller = new AbortController();
    setError("");
    setBusy(true);
    checkedRef.current?.(false);
    api
      .get(`/claims/history/${encodeURIComponent(staffId)}`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setHistory({ staffId, items: response.data.data });
          checkedRef.current?.(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Claims Portal history is unavailable. Any previous results below may be outdated.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [staffId, refresh, manual]);
  return (
    <section
      className="mt-5 border-t border-border-default pt-5"
      aria-label="Member claim history"
      aria-busy={busy}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-text-strong">Member claim history</h2>
        <Button
          variant={manual ? "primary" : "secondary"}
          size="sm"
          loading={busy}
          onClick={() => setRefresh((value) => value + 1)}
        >
          {manual ? "Check Claims Portal history" : "Refresh history"}
        </Button>
      </div>
      {error && <Alert tone="warning">{error}</Alert>}
      {busy && (
        <p role="status" className="text-xs text-text-muted">
          Loading Claim history...
        </p>
      )}
      {items?.length === 0 && (
        <p className="text-xs text-text-muted">No claims returned for this member.</p>
      )}
      {items && items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Claims for Staff ID {staffId}</caption>
            <thead>
              <tr>
                <th scope="col" className="p-2">
                  Claim number
                </th>
                <th scope="col" className="p-2">
                  Name
                </th>
                <th scope="col" className="p-2">
                  Claim date
                </th>
                <th scope="col" className="p-2 text-right">
                  Amount payable — reported by Claims Portal
                </th>
                <th scope="col" className="p-2">
                  Claim status
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.claimNumber}:${index}`} className="border-t border-border-default">
                  <td className="p-2 font-mono">{item.claimNumber}</td>
                  <td className="p-2">{item.name || "Not provided"}</td>
                  <td className="whitespace-nowrap p-2">{item.claimDate ?? "Not provided"}</td>
                  <td className="p-2 text-right tabular-nums">
                    {item.amountPayable == null
                      ? "Not provided by Claims Portal"
                      : formatCurrency(item.amountPayable)}
                  </td>
                  <td className="p-2">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
