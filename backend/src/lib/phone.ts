import { z } from "zod";

// Canonicalizes a Ghana mobile number to one stored/lookup form -- a login-identifier column
// needs an exact-match lookup to work regardless of how someone types it, unlike
// member.search.ts's phoneSearchTerms (which generates several candidate strings for fuzzy
// search matching, not a single canonical value to store). Deliberately separate from
// Member.phone/phoneSearchTerms -- this is a new, unrelated field.
//
// Accepts 0XXXXXXXXX (already canonical), 233XXXXXXXXX, 00233XXXXXXXXX/0233XXXXXXXXX
// (international-dialing-prefix forms), and the common mis-paste 2330XXXXXXXXX/+2330XXXXXXXXX
// (country code plus a redundant leading 0). Returns null if the result isn't exactly 10 digits
// starting with 0. Deliberately does not validate carrier prefix (MTN/Vodafone/AT ranges) --
// Member.phone doesn't either, and a prefix allowlist risks rejecting legitimate but untracked
// ranges as numbering plans change.
export function normalizeGhanaPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2); // 00233... -> 233...
  if (digits.startsWith("233") && digits.length === 13 && digits[3] === "0") {
    digits = `233${digits.slice(4)}`; // 2330XXXXXXXXX -> 233XXXXXXXXX
  }
  if (digits.startsWith("233") && digits.length === 12) {
    digits = `0${digits.slice(3)}`; // 233XXXXXXXXX -> 0XXXXXXXXX
  }

  return /^0\d{9}$/.test(digits) ? digits : null;
}

// Shared by loginSchema.phone and user.schemas.ts's staffFields.phone -- undefined (field
// absent) passes through untouched so `.partial()` on update still means "don't touch this
// field," blank/null means an explicit clear, anything else is normalized or rejected.
export const phoneFieldSchema = z
  .string()
  .trim()
  .max(32)
  .nullable()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const normalized = normalizeGhanaPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid Ghana phone number" });
      return z.NEVER;
    }
    return normalized;
  });
