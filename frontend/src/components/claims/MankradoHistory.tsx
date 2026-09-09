import { useEffect, useState } from "react";
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
}: {
  staffId: string;
  externalId?: string | null;
}) {
  const [items, setItems] = useState<ExternalClaim[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setItems(null);
    setError("");
    setBusy(true);
    api
      .get(`/claims/history/${encodeURIComponent(staffId)}`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setItems(response.data.data);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Mankrado history could not be loaded. Your local claim remains saved.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [staffId, refresh]);
  return (
    <section
      className="mt-5 border-t border-border-default pt-5"
      aria-label="Mankrado history"
      aria-busy={busy}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-text-strong">Mankrado claim history</h2>
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          onClick={() => setRefresh((value) => value + 1)}
        >
          Refresh history
        </Button>
      </div>
      {error && <Alert tone="warning">{error}</Alert>}
      {busy && (
        <p role="status" className="text-xs text-text-muted">
          Loading Mankrado history...
        </p>
      )}
      {items?.length === 0 && (
        <p className="text-xs text-text-muted">No claims returned by Mankrado for this member.</p>
      )}
      {items && items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Mankrado claims for Staff ID {staffId}</caption>
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
                  Amount payable (GHS)
                </th>
                <th scope="col" className="p-2">
                  Mankrado status
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
                    {item.amountPayable === null
                      ? "Not provided"
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
