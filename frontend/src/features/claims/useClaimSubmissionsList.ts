import type { ClaimSubmission } from "@/components/claims/ClaimsTable";
import { usePaginatedList } from "@/lib/usePaginatedList";

const LIMIT = 10;

// Shared by Claims and ClaimApprovals -- both paginate the same /claims/submissions endpoint,
// differing only in which query filters they fix (status/deliveryState vs. awaitingReview=true).
export function useClaimSubmissionsList(filters: Record<string, string | undefined>) {
  return usePaginatedList<ClaimSubmission>("/claims/submissions", filters, {
    limit: LIMIT,
    errorMessage: "Claim submissions could not be loaded.",
  });
}
