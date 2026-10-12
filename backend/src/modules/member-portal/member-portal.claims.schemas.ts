import { z } from "zod";
import { claimSubmissionUnion } from "../claims/claims.schemas.js";
import { claimSubmissionFields } from "../claims/claims.submission-fields.js";
export const memberClaimSubmissionSchema = claimSubmissionUnion(claimSubmissionFields).superRefine(
  (value, ctx) => {
    if (
      (value.claimType === "DEATH" || value.claimType === "TOTAL_PERMANENT_DISABILITY") &&
      value.claimantType !== "SPOUSE"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["claimantType"],
        message: "Death and Total & Permanent Disability claims can only be filed for a spouse.",
      });
    }
  },
);
