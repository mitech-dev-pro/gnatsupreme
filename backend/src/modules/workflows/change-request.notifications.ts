import { logger } from "../../lib/logger.js";
import { notifyMember, notifyStaffForMember } from "../notifications/notification.service.js";

export async function notifyChangeRequested(input: {
  id: number;
  memberId: number;
  type: string;
  updatedAt: Date;
  resubmitted?: boolean;
}) {
  try {
    await notifyStaffForMember({
      memberId: input.memberId,
      type: "MEMBER_CHANGE_REQUESTED",
      title: input.resubmitted ? "Change request resubmitted" : "Member change request",
      message: `A member ${input.resubmitted ? "corrected and resubmitted" : "submitted"} a ${input.type.toLowerCase().replaceAll("_", " ")} request for review.`,
      actionUrl: `/change-requests?request=${input.id}`,
      idempotencyKey: `change-request:${input.id}:${input.updatedAt.toISOString()}`,
    });
  } catch (error) {
    logger.error(
      { err: error, requestId: input.id },
      "Change request saved but staff notification failed",
    );
  }
}

export async function notifyChangeReviewed(input: {
  id: number;
  memberId: number;
  type: string;
  status: string;
  reviewNote: string | null;
  reviewedAt: Date | null;
}) {
  const outcome =
    input.status === "APPROVED"
      ? "approved"
      : input.status === "RETURNED"
        ? "returned for correction"
        : "rejected";
  try {
    await notifyMember({
      memberId: input.memberId,
      type: `CHANGE_REQUEST_${input.status}`,
      title: `Change request ${outcome}`,
      message: `Your ${input.type.toLowerCase().replaceAll("_", " ")} request was ${outcome}.${input.reviewNote ? ` Review note: ${input.reviewNote}` : ""}`,
      actionUrl: `/member/requests#request-${input.id}`,
      idempotencyKey: `change-request-review:${input.id}:${input.reviewedAt!.toISOString()}:${input.status}`,
      sendSms: false,
    });
  } catch (error) {
    logger.error(
      { err: error, requestId: input.id },
      "Change request review saved but member notification failed",
    );
  }
}
