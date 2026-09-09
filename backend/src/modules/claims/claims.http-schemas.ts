import { claimSubmissionFields } from "./claims.submission-fields.js";
import { z } from "zod";
import { claimSubmissionUnion } from "./claims.schemas.js";
export const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(["PENDING", "REDIRECT_READY", "SUBMITTED", "RETURNED", "FAILED", "SYNCHRONIZED"])
    .optional(),
  source: z.enum(["STAFF", "MEMBER_PORTAL"]).optional(),
  // Mirrors the four-condition check the frontend already uses to decide whether a
  // claim's review actions should show (Claims.tsx, ClaimDetail.tsx) -- lets the
  // Claim Approvals queue page ask for exactly that set server-side. A literal (not
  // z.coerce.boolean()) so "?awaitingReview=false" can't coerce to true.
  awaitingReview: z.literal("true").optional(),
});
export const idSchema = z.object({ id: z.coerce.number().int().positive() });
export const lookupSchema = z.object({
  staffId: z
    .string()
    .trim()
    .regex(/^\d{4,7}$/, "Staff ID must contain 4 to 7 digits"),
});
export const estimateSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  claimType: z.enum(["DEATH", "TOTAL_PERMANENT_DISABILITY", "CRITICAL_ILLNESS", "HOSPITALIZATION"]),
  claimantType: z.enum(["MEMBER", "SPOUSE"]),
});
export const submissionSchema = claimSubmissionUnion({
  ...claimSubmissionFields,
  memberId: z.coerce.number().int().positive(),
});
export const reviewSchema = z
  .object({
    action: z.enum(["APPROVE", "RETURN", "REJECT"]),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => value.action === "APPROVE" || Boolean(value.note), {
    message: "A review note is required",
    path: ["note"],
  });
