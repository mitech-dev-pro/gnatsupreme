import assert from "node:assert/strict";
import test from "node:test";

import { claimSubmissionUnion } from "./claims.schemas.js";

const baseSchema = claimSubmissionUnion({});

test("hospitalization accepts date-only admission/discharge values", () => {
  const result = baseSchema.safeParse({
    claimType: "HOSPITALIZATION",
    claimDetails: {
      hospitalName: "Test Hospital",
      admissionDate: "2025-06-01",
      dischargeDate: "2025-06-12",
      reason: "Test",
    },
  });
  assert.equal(result.success, true);
});

test("hospitalization rejects a timestamp-bearing admission/discharge value", () => {
  const result = baseSchema.safeParse({
    claimType: "HOSPITALIZATION",
    claimDetails: {
      hospitalName: "Test Hospital",
      // A timestamp, not a date-only string -- nightsBetween assumes UTC-midnight inputs, and
      // this would otherwise silently round a borderline admission into eligibility.
      admissionDate: "2025-06-01T14:30:00.000Z",
      dischargeDate: "2025-06-12",
      reason: "Test",
    },
  });
  assert.equal(result.success, false);
});
