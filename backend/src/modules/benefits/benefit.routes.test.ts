import assert from "node:assert/strict";
import test from "node:test";
import { Redis } from "ioredis";

import { postHandler, routeHandler, stub } from "../../test/fixtures.js";
import { prisma } from "../../lib/prisma.js";
import { benefitRouter } from "./benefit.routes.js";

function response() {
  return {
    locals: { user: { id: 1, role: "SUPER_ADMIN", regionId: null, districtId: null } },
    code: 200,
    body: null as unknown,
    status(code: number) {
      this.code = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

function message(body: unknown) {
  return (body as { message: string }).message;
}

// Prevents invalidateBenefitPlans()'s cache delete from attempting a real Redis connection --
// same rationale as user.routes.test.ts's stubCache().
function stubCache(t: Parameters<typeof stub>[0]) {
  stub(t, Redis.prototype, "connect", async () => undefined);
  stub(t, Redis.prototype, "scan", async () => ["0", []]);
}

const payload = {
  effectiveFrom: "2026-06-01",
  monthlyPremium: "10",
  collectionMethod: "Payroll deduction",
  note: null,
  benefits: {
    death: { enabled: true, memberAmount: "500", spouseAmount: "250", note: null },
    totalPermanentDisability: {
      enabled: true,
      memberAmount: "500",
      spouseAmount: "250",
      note: null,
    },
    criticalIllness: {
      enabled: true,
      memberAmount: "500",
      spouseAmount: null,
      note: null,
      namedConditions: ["Cancer"],
    },
    hospitalization: { enabled: true, memberAmount: "500", spouseAmount: null, note: null },
  },
};

test("publishing a plan for an effective date that's already taken is rejected", async (t) => {
  stub(t, prisma.benefitPlanVersion, "findUnique", async () => ({ id: 5 }));
  const res = response();
  await postHandler(benefitRouter, "/")({ body: payload }, res);
  assert.equal(res.code, 409);
  assert.match(message(res.body), /already exists/i);
  assert.equal((res.body as { existingPlanId: number }).existingPlanId, 5);
});

test("publishing a new plan invalidates the cached current/schedule views", async (t) => {
  stubCache(t);
  stub(t, prisma.benefitPlanVersion, "findUnique", async () => null);
  stub(t, prisma.benefitPlanVersion, "create", async () => ({
    id: 11,
    effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
  }));
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await postHandler(benefitRouter, "/")({ body: payload }, res);
  assert.equal(res.code, 201);
});

test("updating a plan to an effective date already used by another plan is rejected", async (t) => {
  stub(t, prisma.benefitPlanVersion, "findUnique", async () => ({
    id: 5,
    effectiveFrom: new Date("2026-05-01T00:00:00.000Z"),
  }));
  stub(t, prisma.benefitPlanVersion, "findFirst", async () => ({ id: 6 }));
  const res = response();
  await routeHandler(benefitRouter, "/:id", "patch")({ params: { id: "5" }, body: payload }, res);
  assert.equal(res.code, 409);
  assert.match(message(res.body), /already uses this effective date/i);
});

test("updating a nonexistent plan returns 404", async (t) => {
  stub(t, prisma.benefitPlanVersion, "findUnique", async () => null);
  const res = response();
  await routeHandler(benefitRouter, "/:id", "patch")({ params: { id: "999" }, body: payload }, res);
  assert.equal(res.code, 404);
});

test("updating a plan replaces its benefit rows inside one transaction", async (t) => {
  stubCache(t);
  stub(t, prisma.benefitPlanVersion, "findUnique", async () => ({
    id: 5,
    effectiveFrom: new Date("2026-05-01T00:00:00.000Z"),
  }));
  stub(t, prisma.benefitPlanVersion, "findFirst", async () => null);
  let deletedWhere: unknown;
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.benefitAmount, "deleteMany", async ({ where }: { where: unknown }) => {
    deletedWhere = where;
    return { count: 4 };
  });
  stub(t, prisma.benefitPlanVersion, "update", async () => ({
    id: 5,
    effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
  }));
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await routeHandler(benefitRouter, "/:id", "patch")({ params: { id: "5" }, body: payload }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(deletedWhere, { planVersionId: 5 });
});
