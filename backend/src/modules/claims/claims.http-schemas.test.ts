import assert from "node:assert/strict";
import test from "node:test";
import { submissionSchema, reviewSchema, querySchema } from "./claims.http-schemas.js";

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

test("a staff DEATH submission is not restricted to a spouse claimant", () => {
  assert.equal(submissionSchema.safeParse(death).success, true);
});

test("submissionSchema rejects a malformed contact phone but allows it to be omitted", () => {
  const invalid = {
    ...death,
    claimantContact: { ...death.claimantContact, primaryPhone: "12" },
  };
  assert.equal(submissionSchema.safeParse(invalid).success, false);

  // Payee name and phone are optional at submission -- an empty phone and no paymentDetails pass.
  const sparse = {
    ...death,
    claimantContact: { ...death.claimantContact, primaryPhone: "" },
    paymentDetails: {},
  };
  assert.equal(submissionSchema.safeParse(sparse).success, true);
});

test("review notes and review query remain explicit", () => {
  assert.equal(reviewSchema.safeParse({ action: "RETURN", note: "" }).success, false);
  assert.equal(reviewSchema.safeParse({ action: "REJECT" }).success, false);
  assert.equal(reviewSchema.safeParse({ action: "APPROVE" }).success, true);
  assert.equal(querySchema.safeParse({ awaitingReview: "false" }).success, false);
  assert.equal(querySchema.safeParse({ awaitingReview: "true" }).success, true);
});
