import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Dropdown from "@/components/ui/Dropdown";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import { Alert } from "@/components/ui/Feedback";
import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import ChangeRequestCorrection from "./ChangeRequestCorrection";
import {
  type ChangeRequest,
  type MemberProfile,
  REQUEST_TYPE_LABELS,
  REQUEST_FIELD_LABELS,
  requestValue,
  formatDate,
} from "./MemberHome.shared";

const stages = {
  PENDING: ["Awaiting GNAT review", "GNAT staff will review your requested changes."],
  RETURNED: [
    "Returned for correction",
    "Review the reason below, then correct and resubmit this request.",
  ],
  APPROVED: ["Approved", "Your member record has been updated."],
  REJECTED: ["Rejected", "Review the reason below. Contact your GNAT office if you need help."],
  CANCELLED: ["Cancelled", "This request is closed. Your member record was not changed."],
} as const;

export default function MemberChangeRequests({
  items,
  profile,
  loading,
  error,
  onRefresh,
}: {
  items: ChangeRequest[];
  profile: MemberProfile;
  loading: boolean;
  error: string;
  onRefresh: () => Promise<void>;
}) {
  const { hash } = useLocation();
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<ChangeRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const appliedHash = useRef("");
  const sorted = [...items].sort(
    (a, b) => b.requestedAt.localeCompare(a.requestedAt) || b.id - a.id,
  );
  const filtered = sorted.filter((item) => filter === "ALL" || item.status === filter);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const target = /^#request-([1-9]\d*)$/.exec(hash)?.[1];
  useEffect(() => {
    if (!target || loading || appliedHash.current === hash) return;
    const index = sorted.findIndex((item) => item.id === Number(target));
    if (index < 0) return;
    setFilter("ALL");
    setPage(Math.floor(index / 10) + 1);
    appliedHash.current = hash;
  }, [target, hash, loading, sorted]);
  useEffect(() => {
    if (!target) return;
    const node = document.getElementById(`request-${target}`);
    if (node) {
      node.scrollIntoView?.({ block: "center" });
      node.focus({ preventScroll: true });
    }
  }, [target, currentPage, loading]);
  const cancel = async () => {
    if (!cancelling || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await api.patch(`/member-portal/change-requests/${cancelling.id}/cancel`, {
        expectedUpdatedAt: cancelling.updatedAt,
      });
      setSuccess(`Request #${cancelling.id} cancelled.`);
      setCancelling(null);
      await onRefresh();
    } catch (cause) {
      setActionError(getApiError(cause)?.message || "Unable to cancel. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="min-w-0 overflow-hidden rounded-2xl border border-border-default bg-(--surface-raised) md:col-span-2"
      aria-labelledby="requests-heading"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border-default p-4 sm:p-5">
        <div>
          <h2 id="requests-heading" className="text-lg font-bold text-(--brand-primary)">
            My requests
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            {items.filter((item) => item.status === "PENDING").length} awaiting review ·{" "}
            {items.filter((item) => item.status === "RETURNED").length} need your correction
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dropdown
            aria-label="Filter requests by stage"
            className="w-56"
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
            options={[
              { value: "ALL", label: "All stages" },
              ...Object.entries(stages).map(([value, [label]]) => ({ value, label })),
            ]}
          />
          <Button variant="secondary" size="sm" disabled={loading} onClick={() => void onRefresh()}>
            Refresh requests
          </Button>
        </div>
      </header>
      {success && (
        <div className="p-4">
          <Alert tone="success">{success}</Alert>
        </div>
      )}
      {error && (
        <div className="p-4">
          <Alert tone="warning">
            {error} {items.length > 0 ? "Showing previously loaded requests." : ""}
          </Alert>
        </div>
      )}
      {loading && items.length === 0 ? (
        <p role="status" className="p-5 text-sm text-text-muted">
          Loading requests…
        </p>
      ) : filtered.length === 0 ? (
        <p className="p-5 text-sm text-text-muted">
          {error
            ? "Request history could not be checked."
            : items.length
              ? "No requests match this stage."
              : "No requests yet. Choose an option above to request a change."}
        </p>
      ) : (
        <ol className="divide-y divide-border-default" start={(currentPage - 1) * 10 + 1}>
          {visible.map((item, index) => {
            const [stage, next] = stages[item.status];
            const beneficiary = profile.beneficiaries.find(
              (person) => person.id === item.targetBeneficiaryId,
            );
            return (
              <li
                key={item.id}
                id={`request-${item.id}`}
                tabIndex={-1}
                className="scroll-mt-20 outline-none focus-visible:shadow-focus-inset"
              >
                <details
                  className="group"
                  open={Number(target) === item.id || editing === item.id || undefined}
                >
                  <summary className="flex cursor-pointer items-start justify-between gap-3 p-4 focus-visible:shadow-focus-inset sm:p-5">
                    <span className="min-w-0">
                      <strong className="block text-sm text-ink">
                        {(currentPage - 1) * 10 + index + 1}. {REQUEST_TYPE_LABELS[item.type]}
                      </strong>
                      <span className="mt-1 block text-xs text-text-muted">
                        Request #{item.id} · Submitted {formatDate(item.requestedAt)}
                      </span>
                    </span>
                    <StatusBadge
                      tone={
                        item.status === "APPROVED"
                          ? "success"
                          : item.status === "REJECTED"
                            ? "danger"
                            : item.status === "CANCELLED"
                              ? "neutral"
                              : "warning"
                      }
                    >
                      {stage}
                    </StatusBadge>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      fill="none"
                      className="mt-1 size-4 shrink-0 text-text-muted transition-transform motion-reduce:transition-none group-open:rotate-180"
                    >
                      <path
                        d="m5 7.5 5 5 5-5"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </summary>
                  <div className="space-y-4 px-4 pb-5 sm:px-5">
                    <p className="max-w-prose text-sm text-text-muted">{next}</p>
                    {beneficiary && (
                      <p className="text-sm text-ink">
                        Beneficiary: <strong>{beneficiary.fullName}</strong>
                      </p>
                    )}
                    {item.proposedData && (
                      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
                        {Object.entries(item.proposedData).map(([key, value]) => (
                          <div key={key} className="min-w-0">
                            <dt className="text-xs font-semibold text-text-muted">
                              {REQUEST_FIELD_LABELS[key] ?? key}
                            </dt>
                            <dd className="mt-1 wrap-anywhere text-sm text-ink">
                              {key === "dateOfBirth"
                                ? formatDate(value as string | null)
                                : requestValue(value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {item.type === "BENEFICIARY_REMOVE" && (
                      <p className="text-sm text-text-muted">
                        Requested action: remove this beneficiary.
                      </p>
                    )}
                    {item.requestNote && (
                      <div>
                        <h3 className="text-sm font-bold text-ink">Your note</h3>
                        <p className="max-w-prose whitespace-pre-wrap wrap-anywhere text-sm text-text-muted">
                          {item.requestNote}
                        </p>
                      </div>
                    )}
                    {item.reviewNote && (
                      <div className="rounded-lg bg-surface-subtle p-3">
                        <h3 className="text-sm font-bold text-ink">
                          {item.status === "PENDING" ? "Previous review note" : "Staff review note"}
                        </h3>
                        <p className="mt-1 max-w-prose whitespace-pre-wrap wrap-anywhere text-sm text-ink">
                          {item.reviewNote}
                        </p>
                        {item.reviewedAt && (
                          <p className="mt-1 text-xs text-text-muted">
                            Reviewed {formatDate(item.reviewedAt)}
                          </p>
                        )}
                      </div>
                    )}
                    {item.status === "RETURNED" &&
                      (editing === item.id ? (
                        <ChangeRequestCorrection
                          key={`${item.id}-${item.updatedAt}`}
                          request={item}
                          onClose={() =>
                            setEditing((current) => (current === item.id ? null : current))
                          }
                          onSubmitted={async () => {
                            setSuccess(`Request #${item.id} resubmitted for GNAT review.`);
                            await onRefresh();
                          }}
                        />
                      ) : (
                        <Button onClick={() => setEditing(item.id)}>Edit &amp; resubmit</Button>
                      ))}
                    {item.status === "PENDING" && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setActionError("");
                          setCancelling(item);
                        }}
                      >
                        Cancel request
                      </Button>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      )}
      <div className="px-4 pb-4">
        <Pagination
          page={currentPage}
          totalPages={pages}
          totalItems={filtered.length}
          itemLabel="requests"
          onPageChange={setPage}
        />
      </div>
      {cancelling && (
        <Dialog
          title={`Cancel request #${cancelling.id}?`}
          description="This closes the pending request. Your current member record will not change."
          busy={busy}
          onClose={() => setCancelling(null)}
        >
          {actionError && <Alert tone="error">{actionError}</Alert>}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setCancelling(null)}>
              Keep request
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void cancel()}>
              Cancel request
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
