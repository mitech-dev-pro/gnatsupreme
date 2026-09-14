import { ClaimReviewControls, type ClaimDecision } from "@/features/claims/ClaimReviewControls";
import { getApiError } from "@/lib/errorExtract";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { reviewClaim } from "@/features/claims/claims.api";
import ClaimDetailModal from "@/components/claims/ClaimDetailModal";
import { deliveryLabel } from "@/lib/claimDocuments";
import { claimStatusLabel, claimStatusTone } from "@/lib/claimStatus";
import { formatCurrency } from "@/lib/currency";
import { TableSkeleton } from "@/components/ui/Feedback";
import StatusBadge from "@/components/ui/StatusBadge";
import TableFrame from "@/components/ui/TableFrame";

export type ClaimSubmission = {
  id: number;
  externalClaimId: string | null;
  provider: string;
  deliveryState: string;
  reviewedAt: string | null;
  status: string;
  externalStatus: string | null;
  source: "STAFF" | "MEMBER_PORTAL";
  claimType: string | null;
  claimantName: string | null;
  estimatedAmount: string | null;
  errorMessage: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  member: { id: number; controllerId: string; fullName: string };
  submittedByMember: { id: number; controllerId: string; fullName: string } | null;
};

type Decision = ClaimDecision;

const labelize = (value: string | null) =>
  value
    ? value
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase())
    : "Not recorded";
const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Not recorded";

function ClaimActionMenu({
  row,
  canReview,
  onView,
  onReview,
}: {
  row: ClaimSubmission;
  canReview: boolean;
  onView: () => void;
  onReview: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const toggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const menuHeight = canReview ? 84 : 44;
      setPosition({
        top: rect.bottom + menuHeight > window.innerHeight ? rect.top - menuHeight - 5 : rect.bottom + 5,
        left: Math.max(8, rect.right - 154),
      });
    }
    setOpen((current) => !current);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`Actions for this ${labelize(row.claimType).toLowerCase()} claim`}
        className="grid size-8 place-items-center rounded-lg text-lg leading-none text-text-muted hover:bg-surface-subtle aria-expanded:bg-surface-subtle"
      >
        •••
      </button>
      {open &&
        createPortal(
          <div
            role="menu"
            style={{ position: "fixed", top: position.top, left: position.left, width: 154 }}
            className="z-200 rounded-lg border border-border-default bg-(--surface-raised) p-1 shadow-dropdown"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onView();
              }}
              className="block w-full rounded-md px-2.5 py-2 text-left text-xs font-semibold text-ink hover:bg-info-soft hover:text-action-primary"
            >
              View details
            </button>
            {canReview && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onReview();
                }}
                className="block w-full rounded-md px-2.5 py-2 text-left text-xs font-semibold text-ink hover:bg-info-soft hover:text-action-primary"
              >
                Review
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

export default function ClaimsTable({
  rows,
  loading,
  onReviewed,
  onError,
  emptyState,
}: {
  rows: ClaimSubmission[];
  loading: boolean;
  onReviewed: () => void | Promise<void>;
  onError: (message: string) => void;
  emptyState: ReactNode;
}) {
  const [detailId, setDetailId] = useState<number | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  const startReview = (row: ClaimSubmission) => {
    setReviewingId(row.id);
    setDecision(null);
    setReviewNote("");
    onError("");
  };
  const submitReview = async () => {
    if (!reviewingId || !decision) return;
    if (decision !== "APPROVE" && !reviewNote.trim()) {
      onError("A review note is required when returning or rejecting a claim.");
      return;
    }
    setReviewBusy(true);
    onError("");
    try {
      await reviewClaim(reviewingId, decision, reviewNote);
      setReviewingId(null);
      setDecision(null);
      setReviewNote("");
      await onReviewed();
    } catch (caught: unknown) {
      onError(getApiError(caught)?.message || "The review could not be completed.");
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <>
      <TableFrame label="Claim submissions" className="min-w-210">
        <thead>
          <tr className="border-b border-border-default bg-surface-subtle text-xs font-semibold uppercase tracking-wide text-text-muted">
            <th className="px-4 py-2.5">Member</th>
            <th className="px-4 py-2.5">Claim</th>
            <th className="px-4 py-2.5">Reference</th>
            <th className="px-4 py-2.5">Estimate</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Submitted</th>
            <th className="px-4 py-2.5">Action</th>
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <TableSkeleton columns={7} />
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={7}>{emptyState}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <Fragment key={row.id}>
                <tr className="border-b border-border-default last:border-0">
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/members/${row.member.id}`}
                      className="font-semibold text-text-strong hover:underline"
                    >
                      {row.member.fullName}
                    </Link>
                    <div className="text-xs text-text-muted">{row.member.controllerId}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-ink">{labelize(row.claimType)}</span>
                    {row.claimantName && (
                      <div className="text-xs text-text-muted">{row.claimantName}</div>
                    )}
                    {row.source === "MEMBER_PORTAL" && (
                      <div className="mt-0.5 inline-block rounded-full bg-info-soft px-2 py-0.5 text-xs font-bold text-text-strong">
                        Filed by member
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-xs text-ink">
                      {row.externalClaimId ?? "Not assigned"}
                    </div>
                    <div className="text-xs text-text-muted">{row.provider}</div>
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-ink">
                    {row.estimatedAmount ? formatCurrency(row.estimatedAmount) : "Not available"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={claimStatusTone(row.externalStatus ?? row.status)}>
                      {claimStatusLabel(row.externalStatus ?? row.status)}
                    </StatusBadge>
                    <div className="mt-1 text-xs text-text-muted">
                      {row.provider === "SIMULATION"
                        ? "Historical simulation"
                        : deliveryLabel(row.deliveryState)}
                    </div>
                    {row.errorMessage && (
                      <div className="mt-0.5 text-xs text-danger">{row.errorMessage}</div>
                    )}
                    {row.status === "RETURNED" && row.reviewNote && (
                      <div className="mt-0.5 text-xs text-warning">{row.reviewNote}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-text-muted">{formatDate(row.submittedAt)}</td>
                  <td className="px-4 py-2.5">
                    <ClaimActionMenu
                      row={row}
                      canReview={
                        row.status === "PENDING" &&
                        row.source === "MEMBER_PORTAL" &&
                        !row.reviewedAt &&
                        row.deliveryState === "NOT_SENT"
                      }
                      onView={() => setDetailId(row.id)}
                      onReview={() => startReview(row)}
                    />
                  </td>
                </tr>
                {reviewingId === row.id && (
                  <tr className="border-b border-border-default bg-surface-subtle">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="max-w-160">
                        <p className="mb-2 text-xs font-bold text-text-strong">
                          Review this member-submitted claim
                        </p>
                        <ClaimReviewControls
                          decision={decision}
                          note={reviewNote}
                          busy={reviewBusy}
                          onDecision={setDecision}
                          onNote={setReviewNote}
                          onCancel={() => setReviewingId(null)}
                          onConfirm={() => void submitReview()}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))
          )}
        </tbody>
      </TableFrame>
      {detailId !== null && (
        <ClaimDetailModal
          submissionId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={onReviewed}
        />
      )}
    </>
  );
}
