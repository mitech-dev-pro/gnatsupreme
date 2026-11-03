import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { useRef, useState } from "react";

export type BulkReviewResult = {
  requested: number;
  succeeded: number;
  failed: number;
  results: Array<{
    memberId: number;
    success: boolean;
    memberName?: string;
    status?: string;
    message?: string;
  }>;
};

// Shared by MembersList and PendingApprovals -- both call the same /members/bulk/approve and
// /members/bulk/return endpoints and need the same busy/result/error bookkeeping around them.
// Per-item outcomes (e.g. "no longer pending approval") come back in BulkReviewResult.results
// rather than failing the whole request, so it's always safe to offer these actions regardless
// of what's selected -- an ineligible row is just reported as not-succeeded, never a hard error.
export function useMemberBulkReview(onSettled: () => void | Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkReviewResult | null>(null);
  const [actionError, setActionError] = useState("");
  const actionLock = useRef(false);

  const approve = async (memberIds: number[]) => {
    if (!memberIds.length || actionLock.current) return false;
    actionLock.current = true;
    setBusy(true);
    setActionError("");
    setResult(null);
    try {
      const response = await api.post("/members/bulk/approve", { memberIds });
      setResult(response.data.data);
      await onSettled();
      return true;
    } catch (requestError: unknown) {
      setActionError(
        getApiError(requestError)?.message || "The selected members could not be approved.",
      );
      return false;
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const returnForCorrection = async (memberIds: number[], note: string) => {
    if (!memberIds.length || note.trim().length < 2 || actionLock.current) return false;
    actionLock.current = true;
    setBusy(true);
    setActionError("");
    setResult(null);
    try {
      const response = await api.post("/members/bulk/return", {
        memberIds,
        note: note.trim(),
      });
      setResult(response.data.data);
      await onSettled();
      return true;
    } catch (requestError: unknown) {
      setActionError(
        getApiError(requestError)?.message || "The selected members could not be returned.",
      );
      return false;
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  return {
    busy,
    result,
    clearResult: () => setResult(null),
    actionError,
    clearActionError: () => setActionError(""),
    approve,
    returnForCorrection,
  };
}
