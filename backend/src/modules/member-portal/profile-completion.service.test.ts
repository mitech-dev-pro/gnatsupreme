import assert from "node:assert/strict";
import test from "node:test";

import { calculateProfileCompletion } from "./profile-completion.service.js";

const empty = {
  dateOfBirth: null,
  ghanaCardId: null,
  spouseDeclarationStatus: "UNKNOWN" as const,
  profileCompletionDismissedAt: null,
  hasSpouse: false,
  beneficiaryCount: 0,
  pendingRequests: [],
};

test("reports all required details missing for a new Report 20 member", () => {
  const result = calculateProfileCompletion(empty);
  assert.equal(result.complete, false);
  assert.equal(result.percentage, 0);
  assert.equal(result.showExpandedPrompt, true);
  assert.deepEqual(result.items.map((item) => item.status), ["MISSING", "MISSING", "MISSING", "MISSING"]);
});

test("distinguishes submitted details from approved details", () => {
  const result = calculateProfileCompletion({
    ...empty,
    pendingRequests: [
      { type: "MEMBER_DETAILS", proposedData: { dateOfBirth: "1980-01-01", ghanaCardId: "GHA-000000000-0" } },
      { type: "SPOUSE", proposedData: {} },
      { type: "BENEFICIARY_ADD", proposedData: {} },
    ],
  });
  assert.deepEqual(result.items.map((item) => item.status), ["PENDING", "PENDING", "PENDING", "PENDING"]);
  assert.equal(result.percentage, 0);
});

test("accepts an explicit no-spouse declaration as complete", () => {
  const result = calculateProfileCompletion({
    ...empty,
    dateOfBirth: new Date("1980-01-01"),
    ghanaCardId: "GHA-000000000-0",
    spouseDeclarationStatus: "NONE",
    beneficiaryCount: 1,
  });
  assert.equal(result.complete, true);
  assert.equal(result.percentage, 100);
  assert.equal(result.showExpandedPrompt, false);
});

test("keeps an incomplete dismissed reminder collapsed", () => {
  const result = calculateProfileCompletion({
    ...empty,
    profileCompletionDismissedAt: new Date(),
  });
  assert.equal(result.complete, false);
  assert.equal(result.showExpandedPrompt, false);
});
