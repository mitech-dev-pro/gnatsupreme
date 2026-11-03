import { notifyMember } from "../notifications/notification.service.js";
import { logger } from "../../lib/logger.js";

type ClaimReviewNotification = {
  claimId: number;
  memberId: number;
  action: "APPROVE" | "RETURN" | "REJECT";
  reviewedAt: Date;
  note?: string | null;
  deliveryState?: string;
};

// Review is already committed. A supplementary notification must not turn it into an
// HTTP failure or encourage another review/send attempt. Log failures for follow-up.
export async function notifyClaimReview(input: ClaimReviewNotification) {
  const accepted = input.deliveryState === "ACCEPTED";
  const content =
    input.action === "RETURN"
      ? {
          title: "Claim returned for correction",
          message:
            "GNAT returned your claim for correction. Review the reason, update your claim and resubmit it.",
        }
      : input.action === "REJECT"
        ? {
            title: "Claim rejected by GNAT",
            message:
              "GNAT rejected your claim. Review the reason and contact your GNAT office if you need help.",
          }
        : accepted
          ? {
              title: "Claim forwarded to Claims Portal",
              message:
                "GNAT approved forwarding your claim and Claims Portal confirmed receipt. Claims Portal will assess the claim; this is not approval of payment.",
            }
          : {
              title: "Claim approved for forwarding",
              message:
                "GNAT approved forwarding your claim, but receipt by Claims Portal is not yet confirmed. Staff will follow up on delivery. This is not approval of payment.",
            };
  try {
    await notifyMember({
      memberId: input.memberId,
      type: {
        APPROVE: "CLAIM_APPROVED_FOR_FORWARDING",
        RETURN: "CLAIM_RETURNED",
        REJECT: "CLAIM_REJECTED",
      }[input.action],
      title: content.title,
      message: `${content.message}${input.note?.trim() ? ` Review note: ${input.note.trim()}` : ""}`,
      actionUrl:
        input.action === "RETURN"
          ? `/member/claims/${input.claimId}/resubmit`
          : `/member/claims#claim-${input.claimId}`,
      idempotencyKey:
        input.action === "APPROVE" && accepted
          ? `claim-forwarded:${input.claimId}`
          : `claim-review:${input.claimId}:${input.reviewedAt.toISOString()}:${input.action}`,
      sendSms: false,
    });
  } catch (error) {
    logger.error(
      { err: error, claimId: input.claimId, action: input.action },
      "Claim review saved but member notification failed",
    );
  }
}
