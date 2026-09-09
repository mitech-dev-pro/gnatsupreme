import assert from "node:assert/strict";
import test from "node:test";
import { submissionSchema, reviewSchema, querySchema } from "./claims.http-schemas.js";
import { memberClaimSubmissionSchema } from "../member-portal/member-portal.claims.schemas.js";

const death = {
  memberId: 123,
  claimType: "DEATH",
  claimantType: "MEMBER",
  claimantIdType: "GHANA_CARD",
  claimantIdNumber: "GHA-123456789-0",
  claimantContact: {
    fullName: "Test Claimant",
    primaryPhone: "0200000000",
    nationality: "Ghanaian",
  },
  claimDetails: {
    subjectName: "Test Member",
    relationship: "Self",
    dateOfEvent: "2025-06-01",
    cause: "Test cause",
  },
  paymentMethod: "CHEQUE",
  paymentDetails: { payeeName: "Test Claimant" },
};

test("shared fields retain the different staff and member death eligibility rules", () => {
  assert.equal(submissionSchema.safeParse(death).success, true);
  assert.equal(memberClaimSubmissionSchema.safeParse(death).success, false);
  const spouse = memberClaimSubmissionSchema.safeParse({ ...death, claimantType: "SPOUSE" });
  assert.equal(spouse.success, true);
  if (spouse.success) assert.equal("memberId" in spouse.data, false);
});

test("both claim entrypoints reject incomplete contact details", () => {
  const invalid = {
    ...death,
    claimantType: "SPOUSE",
    claimantContact: { ...death.claimantContact, primaryPhone: "12" },
  };
  assert.equal(submissionSchema.safeParse(invalid).success, false);
  assert.equal(memberClaimSubmissionSchema.safeParse(invalid).success, false);
});

test("review notes and review query remain explicit", () => {
  assert.equal(reviewSchema.safeParse({ action: "RETURN", note: "" }).success, false);
  assert.equal(reviewSchema.safeParse({ action: "REJECT" }).success, false);
  assert.equal(reviewSchema.safeParse({ action: "APPROVE" }).success, true);
  assert.equal(querySchema.safeParse({ awaitingReview: "false" }).success, false);
  assert.equal(querySchema.safeParse({ awaitingReview: "true" }).success, true);
});
