import ClaimsPortalStatus from "@/components/claims/ClaimsPortalStatus";
import ClaimsTable from "@/components/claims/ClaimsTable";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import { useClaimSubmissionsList } from "./useClaimSubmissionsList";

const FILTERS = { awaitingReview: "true" };

export default function ClaimApprovals() {
  const { page, limit, rows, total, totalPages, loading, error, setError, load, updateParams } =
    useClaimSubmissionsList(FILTERS);

  return (
    <div>
      <PageHeader
        title="Claim Approvals"
        description="Member-filed claims waiting for your review before they're sent to Claims Portal."
        actions={<ClaimsPortalStatus />}
      />
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <ClaimsTable
        rows={rows}
        loading={loading}
        rowOffset={(page - 1) * limit}
        reviewActions
        onReviewed={load}
        onError={setError}
        emptyState={
          error ? (
            <div className="p-6 text-sm text-text-muted">
              Approvals could not be loaded.{" "}
              <button
                type="button"
                onClick={() => void load()}
                className="font-semibold text-ink underline"
              >
                Try again
              </button>
            </div>
          ) : (
            <EmptyState
              title="No claims are waiting for your approval"
              description="Member-filed claims will appear here until they're approved, returned, or rejected."
            />
          )
        }
      />
      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={total}
        itemLabel="claims"
        onPageChange={(nextPage) => updateParams({ page: String(nextPage) })}
      />
    </div>
  );
}
