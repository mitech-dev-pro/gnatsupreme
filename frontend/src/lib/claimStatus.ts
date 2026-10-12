// Claim status can come from two places: our internal lifecycle enum
// (ExternalClaimStatus: PENDING, REDIRECT_READY, SUBMITTED, RETURNED, FAILED,
// SYNCHRONIZED) and Mankrado's free-text externalStatus ("Awaiting Approval",
// "Assessing", "Completed", "Paid", "Rejected", ...). Both are mapped to one set
// of badge tones here so colours are consistent everywhere a claim status shows.

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_RULES: [RegExp, BadgeTone][] = [
  [/reject|declin|denied|fail|cancel|void/i, "danger"],
  [/paid|complete|approv|settle|synchroniz|success|closed/i, "success"],
  [/return|correction|resubmit|hold|query|more info/i, "warning"],
  [/submit|receiv|assess|await|review|process|redirect|sent|pending|open/i, "info"],
];

export function claimStatusTone(status?: string | null): BadgeTone {
  if (!status) return "neutral";
  for (const [pattern, tone] of TONE_RULES) if (pattern.test(status)) return tone;
  return "neutral";
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
