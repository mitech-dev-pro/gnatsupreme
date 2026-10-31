import assert from "node:assert/strict";
import test from "node:test";

import { createBenefitPlanSchema } from "./benefit.schemas.js";

type Benefit = {
  enabled: boolean;
  memberAmount: string;
  spouseAmount: string | null;
  note: string | null;
  namedConditions?: string[];
};

function plan(overrides: Record<string, unknown> = {}) {
  const defaultBenefit: Benefit = {
    enabled: true,
    memberAmount: "500",
    spouseAmount: "250",
    note: null,
  };
  return {
    effectiveFrom: "2026-01-01",
    monthlyPremium: "10",
    collectionMethod: "Payroll deduction",
    note: null,
    benefits: {
      death: { ...defaultBenefit } as Benefit,
      totalPermanentDisability: { ...defaultBenefit } as Benefit,
      criticalIllness: {
        enabled: true,
        memberAmount: "500",
        spouseAmount: null,
        note: null,
        namedConditions: ["Cancer"],
      } as Benefit,
      hospitalization: { ...defaultBenefit, spouseAmount: null } as Benefit,
    },
    ...overrides,
  };
}

test("accepts a plan with valid spouse-cover rules and a named critical illness", () => {
  const result = createBenefitPlanSchema.safeParse(plan());
  assert.equal(result.success, true);
});

test("rejects spouse cover on critical illness, which has no spouse rate", () => {
  const data = plan();
  data.benefits.criticalIllness = { ...data.benefits.criticalIllness, spouseAmount: "100" };
  const result = createBenefitPlanSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("rejects spouse cover on hospitalization, which has no spouse rate", () => {
  const data = plan();
  data.benefits.hospitalization = { ...data.benefits.hospitalization, spouseAmount: "100" };
  const result = createBenefitPlanSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("an enabled critical illness benefit requires at least one named condition", () => {
  const data = plan();
  data.benefits.criticalIllness = { ...data.benefits.criticalIllness, namedConditions: [] };
  const result = createBenefitPlanSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("named conditions are rejected on every benefit type except critical illness", () => {
  const data = plan();
  data.benefits.death = { ...data.benefits.death, namedConditions: ["Not allowed"] };
  const result = createBenefitPlanSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("the monthly premium must be greater than zero", () => {
  const data = plan({ monthlyPremium: "0" });
  const result = createBenefitPlanSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("a negative benefit amount is rejected", () => {
  const data = plan();
  data.benefits.death = { ...data.benefits.death, memberAmount: "-50" };
  const result = createBenefitPlanSchema.safeParse(data);
  assert.equal(result.success, false);
});

test("an effective date must be a real calendar date in YYYY-MM-DD form", () => {
  const data = plan({ effectiveFrom: "2026-02-30" });
  const result = createBenefitPlanSchema.safeParse(data);
  assert.equal(result.success, false);
});
