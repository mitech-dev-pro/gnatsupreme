import ClaimReviewModal from "./ClaimReviewModal";
import { useState, type ReactNode } from "react";
import ActionMenu from "@/components/ui/ActionMenu";
import { Link } from "react-router-dom";
import ClaimDetailModal from "@/components/claims/ClaimDetailModal";
import { claimStage } from "@/lib/claimStatus";
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
  return (
    <ActionMenu
      label={`Actions for this ${labelize(row.claimType).toLowerCase()} claim`}
      items={[
        { label: "View details", onSelect: onView },
        ...(canReview ? [{ label: "Review", onSelect: onReview }] : []),
      ]}
    />
  );
}

export default function ClaimsTable({
  rows,
  loading,
  onReviewed,
  onError,
  emptyState,
  rowOffset,
  reviewActions = false,
}: {
  rows: ClaimSubmission[];
  loading: boolean;
  onReviewed: () => void | Promise<void>;
  onError: (message: string) => void;
  emptyState: ReactNode;
  rowOffset?: number;
  reviewActions?: boolean;
}) {
  const [detailId, setDetailId] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState<ClaimSubmission | null>(null);

  return (
    <>
      <TableFrame label="Claim submissions" className="min-w-210">
        <thead>
          <tr className="border-b border-border-default bg-surface-subtle text-xs font-semibold uppercase tracking-wide text-text-muted">
            {rowOffset !== undefined && (
              <th scope="col" className="px-4 py-2.5">
                No.
              </th>
            )}
            <th className="px-4 py-2.5">Member</th>
            <th className="px-4 py-2.5">Claim</th>
            <th className="px-4 py-2.5">{reviewActions ? "Claim Reference" : "Reference"}</th>
            <th className="px-4 py-2.5">Estimated benefit — subject to insurer assessment</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Sent to Claims Portal on</th>
            <th className="px-4 py-2.5">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <TableSkeleton columns={rowOffset !== undefined ? 8 : 7} />
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={rowOffset !== undefined ? 8 : 7}>{emptyState}</td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row.id} className="border-b border-border-default last:border-0">
                {rowOffset !== undefined && (
                  <td className="px-4 py-2.5 text-text-muted">{rowOffset + index + 1}</td>
                )}
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
                    {reviewActions
                      ? `CLM-${String(row.id).padStart(6, "0")}`
                      : (row.externalClaimId ?? "Awaiting receipt confirmation")}
                  </div>
                  <div className="text-xs text-text-muted">{row.provider}</div>
                </td>
                <td className="px-4 py-2.5 font-semibold text-ink">
                  {row.estimatedAmount ? formatCurrency(row.estimatedAmount) : "Not available"}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge tone={claimStage(row).tone}>{claimStage(row).label}</StatusBadge>
                  <div className="mt-1 text-xs text-text-muted">{claimStage(row).next}</div>
                  {row.externalStatus && (
                    <div className="mt-1 text-xs text-text-muted">
                      Claims Portal: {row.externalStatus}
                    </div>
                  )}
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
                    onReview={() => {
                      setReviewing(row);
                      onError("");
                    }}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableFrame>
      {reviewing && (
        <ClaimReviewModal
          key={reviewing.id}
          claim={reviewing}
          onClose={() => setReviewing(null)}
          onReviewed={onReviewed}
        />
      )}
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
