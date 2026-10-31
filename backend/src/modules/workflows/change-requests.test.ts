import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { stub, routeHandler } from "../../test/fixtures.js";
import { AppError } from "../../middleware/error-handler.js";
import { memberChangeCorrectionRouter } from "../member-portal/member-change-requests.routes.js";
import { changeRequestRouter } from "./workflow.routes.js";
import { notifyChangeReviewed } from "./change-request.notifications.js";
import { reviewChangeRequestSchema, bulkChangeRequestReviewSchema } from "./workflow.schemas.js";

const timestamp = new Date("2026-10-29T12:00:00.000Z");
const original = {
  id: 42,
  memberId: 7,
  type: "MEMBER_DETAILS",
  targetBeneficiaryId: null,
  status: "RETURNED",
  proposedData: { school: "Wrong school" },
  requestNote: null,
  reviewNote: "Please correct the school",
  updatedAt: timestamp,
  reviewedAt: timestamp,
};
const body = {
  type: "MEMBER_DETAILS",
  proposedData: { school: "Correct School", districtId: 999 },
  requestNote: "Corrected",
  expectedUpdatedAt: timestamp.toISOString(),
};
function response() {
  return {
    locals: { member: { id: 7, controllerId: "TEST7" } },
    code: 200,
    body: null as unknown,
    status(value: number) {
      this.code = value;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      return this;
    },
  };
}
function mocks(t: Parameters<typeof stub>[0]) {
  stub(
    t,
    prisma,
    "$transaction",
    async (callback: ((client: typeof prisma) => Promise<unknown>) | Promise<unknown>[]) =>
      typeof callback === "function" ? callback(prisma) : Promise.all(callback),
  );
  stub(t, prisma.auditLog, "create", async () => ({}));
  stub(t, prisma.member, "findUnique", async () => ({ districtId: 9, district: { regionId: 3 } }));
  stub(t, prisma.user, "findMany", async () => []);
}
const resubmit = routeHandler(memberChangeCorrectionRouter, "/:id/resubmit", "patch");

test("only owned returned requests can be corrected; stale, closed and foreign requests fail", async (t) => {
  mocks(t);
  let item: typeof original | null = null;
  const find = stub(
    t,
    prisma.memberChangeRequest,
    "findFirst",
    async (args: { where: { memberId?: number } }) => {
      assert.equal(args.where.memberId, 7);
      return item;
    },
  );
  const write = stub(t, prisma.memberChangeRequest, "updateMany", async () =>
    assert.fail("must not change an inaccessible or closed request"),
  );
  await assert.rejects(
    resubmit({ params: { id: "42" }, body }, response()),
    (error: unknown) => error instanceof AppError && error.statusCode === 404,
  );
  for (const status of ["PENDING", "APPROVED", "REJECTED", "CANCELLED"]) {
    item = { ...original, status };
    await assert.rejects(resubmit({ params: { id: "42" }, body }, response()), /request changed/);
  }
  item = { ...original, updatedAt: new Date(timestamp.getTime() + 1) };
  await assert.rejects(resubmit({ params: { id: "42" }, body }, response()), /request changed/);
  assert.equal(write.mock.callCount(), 0);
  assert.equal(find.mock.callCount(), 6);
});

test("resubmission validates fields and requires a version", async () => {
  for (const invalid of [
    { ...body, expectedUpdatedAt: undefined },
    { ...body, proposedData: { school: "x" } },
    { ...body, proposedData: { ghanaCardId: "invalid" } },
  ]) {
    const res = response();
    await resubmit({ params: { id: "42" }, body: invalid }, res);
    assert.equal(res.code, 400);
  }
});

test("resubmission retains the same ID and previous review, strips privileged fields and audits the correction", async (t) => {
  mocks(t);
  let count = 0;
  stub(t, prisma.memberChangeRequest, "findFirst", async () => (++count === 1 ? original : null));
  const write = stub(
    t,
    prisma.memberChangeRequest,
    "updateMany",
    async (args: { where: object; data: object }) => {
      assert.deepEqual(args.where, {
        id: 42,
        memberId: 7,
        status: "RETURNED",
        updatedAt: timestamp,
      });
      assert.deepEqual(args.data, {
        status: "PENDING",
        proposedData: { school: "Correct School" },
        requestNote: "Corrected",
      });
      return { count: 1 };
    },
  );
  stub(t, prisma.memberChangeRequest, "findUniqueOrThrow", async () => ({
    ...original,
    status: "PENDING",
    updatedAt: new Date(timestamp.getTime() + 1),
  }));
  const res = response();
  await resubmit({ params: { id: "42" }, body }, res);
  assert.equal(res.code, 200);
  assert.equal(write.mock.callCount(), 1);
  assert.equal((res.body as { data: { id: number; reviewNote: string } }).data.id, 42);
  assert.equal((res.body as { data: { reviewNote: string } }).data.reviewNote, original.reviewNote);
});

test("correction cannot change the request type or beneficiary", async (t) => {
  mocks(t);
  stub(t, prisma.memberChangeRequest, "findFirst", async () => original);
  await assert.rejects(
    resubmit(
      {
        params: { id: "42" },
        body: { ...body, type: "BENEFICIARY_REMOVE", targetBeneficiaryId: 88 },
      },
      response(),
    ),
    /original request type and beneficiary/,
  );
});

test("a pending duplicate or a concurrent correction prevents resubmission", async (t) => {
  mocks(t);
  let duplicate = true,
    calls = 0;
  stub(t, prisma.memberChangeRequest, "findFirst", async () =>
    ++calls % 2 === 1 ? original : duplicate ? { id: 99 } : null,
  );
  stub(t, prisma.memberChangeRequest, "updateMany", async () => ({ count: 0 }));
  await assert.rejects(resubmit({ params: { id: "42" }, body }, response()), /matching request/);
  duplicate = false;
  await assert.rejects(resubmit({ params: { id: "42" }, body }, response()), /request changed/);
});

test("beneficiary corrections require an existing beneficiary on the same member", async (t) => {
  mocks(t);
  stub(t, prisma.memberChangeRequest, "findFirst", async () => ({
    ...original,
    type: "BENEFICIARY_REMOVE",
    targetBeneficiaryId: 88,
  }));
  stub(t, prisma.beneficiary, "findFirst", async (args: { where: object }) => {
    assert.deepEqual(args.where, { id: 88, memberId: 7 });
    return null;
  });
  await assert.rejects(
    resubmit(
      {
        params: { id: "42" },
        body: { ...body, type: "BENEFICIARY_REMOVE", targetBeneficiaryId: 88 },
      },
      response(),
    ),
    /no longer on your record/,
  );
});

test("both individual and bulk decisions require a reason for return and rejection", () => {
  for (const action of ["RETURN", "REJECT"]) {
    assert.equal(reviewChangeRequestSchema.safeParse({ action, note: "  " }).success, false);
    assert.equal(
      bulkChangeRequestReviewSchema.safeParse({ changeRequestIds: [42], action }).success,
      false,
    );
  }
});

test("two concurrent staff return decisions only commit and notify once", async (t) => {
  mocks(t);
  const item = {
    ...original,
    status: "PENDING",
    member: { fullName: "Member", beneficiaries: [], districtId: 9, district: { regionId: 3 } },
  };
  stub(t, prisma.memberChangeRequest, "findFirst", async () => item);
  let reserved = false;
  stub(t, prisma.memberChangeRequest, "updateMany", async () => {
    if (reserved) return { count: 0 };
    reserved = true;
    return { count: 1 };
  });
  const writes = stub(t, prisma.memberChangeRequest, "update", async () => ({
    ...original,
    reviewedAt: timestamp,
  }));
  stub(t, prisma.memberChangeRequest, "findUnique", async () => ({
    ...original,
    reviewedAt: timestamp,
  }));
  const notifications = stub(t, prisma.notification, "upsert", async () => ({}));
  const layer = changeRequestRouter.stack.find((entry) => entry.route?.path === "/:id/review");
  const handle = layer!.route!.stack.at(-1)!.handle;
  const review = () =>
    handle(
      {
        params: { id: "42" },
        body: { action: "RETURN", note: "Correct school" },
      } as unknown as Request,
      { ...response(), locals: { user: { id: 1, role: "SUPER_ADMIN" } } } as unknown as Response,
      () => {},
    );
  const outcomes = await Promise.allSettled([review(), review()]);
  assert.equal(outcomes.filter((value) => value.status === "fulfilled").length, 1);
  assert.equal(writes.mock.callCount(), 1);
  assert.equal(notifications.mock.callCount(), 1);
});

test("each review cycle has its own actionable in-app notification and never looks up a phone", async (t) => {
  stub(t, prisma.member, "findUnique", async () =>
    assert.fail("must not fetch a phone for an in-app decision"),
  );
  const keys: string[] = [];
  stub(
    t,
    prisma.notification,
    "upsert",
    async (args: {
      where: { idempotencyKey: string };
      create: { channel: string; actionUrl: string };
    }) => {
      keys.push(args.where.idempotencyKey);
      assert.equal(args.create.channel, "IN_APP");
      assert.equal(args.create.actionUrl, "/member/requests#request-42");
      return {};
    },
  );
  await notifyChangeReviewed(original);
  await notifyChangeReviewed({ ...original, reviewedAt: new Date(timestamp.getTime() + 1) });
  assert.equal(new Set(keys).size, 2);
});

test("bulk review skips stale versions while committing the other decision", async (t) => {
  mocks(t);
  stub(
    t,
    prisma.memberChangeRequest,
    "findFirst",
    async (args: { where: { id: number; member: object } }) => {
      assert.ok(args.where.member);
      return {
        ...original,
        id: args.where.id,
        status: "PENDING",
        member: { fullName: "Member", beneficiaries: [], districtId: 9, district: { regionId: 3 } },
      };
    },
  );
  stub(t, prisma.memberChangeRequest, "updateMany", async () => ({ count: 1 }));
  const writes = stub(t, prisma.memberChangeRequest, "update", async () => ({
    ...original,
    status: "REJECTED",
  }));
  stub(t, prisma.notification, "upsert", async () => ({}));
  const layer = changeRequestRouter.stack.find((entry) => entry.route?.path === "/bulk/review");
  const res = { ...response(), locals: { user: { id: 1, role: "SUPER_ADMIN" } } };
  await layer!.route!.stack.at(-1)!.handle(
    {
      body: {
        changeRequestIds: [42, 43],
        versions: {
          "42": timestamp.toISOString(),
          "43": new Date(timestamp.getTime() - 1).toISOString(),
        },
        action: "REJECT",
        note: "Not supported",
      },
    } as unknown as Request,
    res as unknown as Response,
    () => {},
  );
  const result = (
    res.body as {
      data: { succeeded: number; failed: number; results: Array<{ message?: string }> };
    }
  ).data;
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 1);
  assert.match(result.results[1]!.message!, /request changed/);
  assert.equal(writes.mock.callCount(), 1);
});
