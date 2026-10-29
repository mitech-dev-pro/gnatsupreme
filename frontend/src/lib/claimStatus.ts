// Claim status can come from two places: our internal lifecycle enum
// (ExternalClaimStatus: PENDING, REDIRECT_READY, SUBMITTED, RETURNED, FAILED,
// SYNCHRONIZED) and Mankrado's free-text externalStatus ("Awaiting Approval",
// "Assessing", "Completed", "Paid", "Rejected", ...). Both are mapped to one set
// of badge tones here so colours are consistent everywhere a claim status shows.

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_RULES: [RegExp, BadgeTone][] = [
  [/reject|declin|denied|fail|cancel|void/i, "danger"],
  [/\b(awaiting|pending|under review|processing|assessing)\b/i, "info"],
  [/^(paid|completed?|approved|settled|synchronized|success|closed)$/i, "success"],
  [/return|correction|resubmit|hold|query|more info/i, "warning"],
  [/submit|receiv|assess|await|review|process|redirect|sent|pending|open/i, "info"],
];

export function claimStatusTone(status?: string | null): BadgeTone {
  if (!status) return "neutral";
  for (const [pattern, tone] of TONE_RULES) if (pattern.test(status)) return tone;
  return "neutral";
}

export type ClaimStageInput = {
  provider?: string;
  status: string;
  source?: string;
  reviewedAt?: string | null;
  deliveryState?: string;
};

export function claimStage(claim: ClaimStageInput): {
  label: string;
  tone: BadgeTone;
  next: string;
} {
  if (claim.provider === "SIMULATION")
    return {
      label: "Historical simulation",
      tone: "neutral",
      next: "This historical record is not connected to Mankrado.",
    };
  if (claim.status === "RETURNED")
    return {
      label: "Returned for correction",
      tone: "warning",
      next: "The member must correct and resubmit this claim for GNAT review.",
    };
  if (claim.status === "FAILED")
    return {
      label: "Rejected by GNAT",
      tone: "danger",
      next: "Read the review note for the reason and contact GNAT for help.",
    };
  if (claim.deliveryState === "UNKNOWN")
    return {
      label: "Delivery unconfirmed",
      tone: "warning",
      next: "Staff must check this member’s Mankrado history before retrying; the claim may already have arrived.",
    };
  if (claim.deliveryState === "FAILED")
    return {
      label: "Delivery failed",
      tone: "danger",
      next: "Staff must resolve the delivery error and retry sending this saved claim.",
    };
  if (claim.deliveryState === "SENDING")
    return {
      label: "Sending to Mankrado",
      tone: "info",
      next: "Wait for confirmation that Mankrado received the claim.",
    };
  if (
    claim.deliveryState === "ACCEPTED" ||
    claim.status === "SUBMITTED" ||
    claim.status === "SYNCHRONIZED"
  )
    return {
      label: "Received by Mankrado",
      tone: "info",
      next: "Mankrado handles assessment and settlement. See the insurer’s reported status separately.",
    };
  if (claim.source === "MEMBER_PORTAL" && !claim.reviewedAt)
    return {
      label: "Awaiting GNAT review",
      tone: "info",
      next: "GNAT staff must review this claim before forwarding it to Mankrado.",
    };
  return {
    label: "Ready to send to Mankrado",
    tone: "info",
    next: "Staff must send this saved claim to Mankrado for assessment.",
  };
}

// Internal enum values are UPPER_SNAKE_CASE and need humanising; Mankrado strings
// are already display-ready, so leave them untouched.
export function claimStatusLabel(status?: string | null): string {
  if (!status) return "Not recorded";
  if (!/^[A-Z][A-Z_]*$/.test(status)) return status;
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
