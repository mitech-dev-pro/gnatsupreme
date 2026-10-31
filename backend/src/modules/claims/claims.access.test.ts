import { stub, routeHandler } from "../../test/fixtures.js";
import type { Prisma } from "../../generated/prisma/client.js";
import assert from "node:assert/strict";
import test from "node:test";
import { claimsRouter } from "./claims.routes.js";
import { prisma } from "../../lib/prisma.js";
import { claimsProvider } from "./mankrado.provider.js";
import { authenticate } from "../../middleware/authenticate.js";

const user = { id: 1, role: "DISTRICT_ADMIN", districtId: 9, regionId: null };
function response() {
  return {
    locals: { user },
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
test("claims router requires authentication before endpoint handlers", async () => {
  assert.equal(claimsRouter.stack[0]?.handle, authenticate);
  const res = response();
  await authenticate(
    { header: () => undefined } as unknown as import("express").Request,
    res as unknown as import("express").Response,
    () => assert.fail("must not pass"),
  );
  assert.equal(res.code, 401);
});
test("out-of-scope history cannot call Mankrado", async (t) => {
  stub(
    t,
    prisma.member,
    "findFirst",
    async (args: Prisma.MemberFindFirstArgs & { where: Prisma.MemberWhereInput }) => {
      assert.equal(args.where.controllerId, "123456");
      assert.equal(args.where.districtId, 9);
      return null;
    },
  );
  const remote = t.mock.method(claimsProvider, "history", async () => []);
  const res = response();
  await routeHandler(claimsRouter, "/history/:staffId")({ params: { staffId: "123456" } }, res);
  assert.equal(res.code, 404);
  assert.equal(remote.mock.callCount(), 0);
});
test("external detail access requires a locally associated, scoped Mankrado claim", async (t) => {
  stub(
    t,
    prisma.externalClaimSubmission,
    "findFirst",
    async (
      args: Prisma.ExternalClaimSubmissionFindFirstArgs & {
        where: Prisma.ExternalClaimSubmissionWhereInput;
      },
    ) => {
      assert.equal(args.where.externalClaimId, "MK-1");
      assert.equal(args.where.provider, "Claims System");
      assert.equal(args.where.member?.is?.districtId, 9);
      return null;
    },
  );
  const remote = t.mock.method(claimsProvider, "details", async () => ({
    id: "MK-1",
    claimNumber: "MC-1",
    name: null,
    claimDate: null,
    amountPayable: null,
    rejectReason: null,
  }));
  const res = response();
  await routeHandler(claimsRouter, "/claimdetails/:externalId")(
    { params: { externalId: "MK-1" } },
    res,
  );
  assert.equal(res.code, 404);
  assert.equal(remote.mock.callCount(), 0);
});
test("authorized history is returned but mismatched member data is rejected", async (t) => {
  stub(t, prisma.member, "findFirst", async () => ({ id: 1 }));
  const remote = t.mock.method(claimsProvider, "history", async () => [
    { id: "MK-1", staffId: "123456" },
  ]);
  const res = response();
  await routeHandler(claimsRouter, "/history/:staffId")({ params: { staffId: "123456" } }, res);
  assert.equal(res.code, 200);
  assert.equal((res.body as { data: { id: string }[] }).data[0]?.id, "MK-1");
  remote.mock.mockImplementation(async () => [{ id: "OTHER", staffId: "999999" }]);
  const other = response();
  await routeHandler(claimsRouter, "/history/:staffId")({ params: { staffId: "123456" } }, other);
  assert.equal(other.code, 502);
  assert.equal((other.body as { data?: unknown }).data, undefined);
});
test("detail sync stores external status without changing local review status", async (t) => {
  stub(t, prisma.externalClaimSubmission, "findFirst", async () => ({
    id: 1,
    member: { controllerId: "123456" },
  }));
  t.mock.method(claimsProvider, "details", async () => ({
    id: "MK-1",
    claimNumber: "MC-1",
    name: "Test Member",
    claimDate: null,
    amountPayable: "8095.64",
    rejectReason: null,
    staffId: "123456",
    status: "ASSESSING",
  }));
  stub(
    t,
    prisma.externalClaimSubmission,
    "update",
    async (
      args: Prisma.ExternalClaimSubmissionUpdateArgs & {
        where: Prisma.ExternalClaimSubmissionWhereInput;
      },
    ) => {
      assert.equal(args.data.externalStatus, "ASSESSING");
      assert.equal(args.data.status, undefined);
      assert.deepEqual(args.data.externalAssessment, {
        claimNumber: "MC-1",
        name: "Test Member",
        claimDate: null,
        amountPayable: "8095.64",
        status: "ASSESSING",
        rejectReason: null,
      });
      assert.equal(args.data.estimatedAmount, undefined);
      assert.equal(args.data.claimDetails, undefined);
      assert.ok(args.data.lastSyncedAt instanceof Date);
      return {};
    },
  );
  const res = response();
  await routeHandler(claimsRouter, "/claimdetails/:externalId")(
    { params: { externalId: "MK-1" } },
    res,
  );
  assert.equal(res.code, 200);
  assert.ok((res.body as { data: { lastSyncedAt: Date } }).data.lastSyncedAt instanceof Date);
});

test("unconfirmed retry requires acknowledgment before contacting history or sending", async (t) => {
  stub(t, prisma.externalClaimSubmission, "findFirst", async () => ({
    id: 1,
    deliveryState: "UNKNOWN",
    member: { controllerId: "123456" },
  }));
  t.mock.method(claimsProvider, "isConfigured", () => true);
  const history = t.mock.method(claimsProvider, "history", async () => []);
  const send = t.mock.method(claimsProvider, "createSubmission", async () => {
    throw new Error("must not send");
  });
  const res = response();
  await routeHandler(claimsRouter, "/submissions/:id/send")({ params: { id: "1" }, body: {} }, res);
  assert.equal(res.code, 409);
  assert.equal(history.mock.callCount(), 0);
  assert.equal(send.mock.callCount(), 0);
});

test("unconfirmed retry is blocked and audited when scoped history is unavailable", async (t) => {
  stub(t, prisma.externalClaimSubmission, "findFirst", async () => ({
    id: 1,
    deliveryState: "UNKNOWN",
    member: { controllerId: "123456" },
  }));
  t.mock.method(claimsProvider, "isConfigured", () => true);
  t.mock.method(claimsProvider, "history", async () => {
    throw new Error("offline");
  });
  stub(t, prisma.auditLog, "create", async () => ({}));
  const send = t.mock.method(claimsProvider, "createSubmission", async () => {
    throw new Error("must not send");
  });
  const res = response();
  await routeHandler(claimsRouter, "/submissions/:id/send")(
    { params: { id: "1" }, body: { historyChecked: true } },
    res,
  );
  assert.equal(res.code, 503);
  assert.equal(send.mock.callCount(), 0);
});

for (const history of [[], [{ id: "other", claimNumber: "MC-OTHER", staffId: "123456" }]]) {
  test(`unconfirmed retry accepts a successful ${history.length ? "populated" : "empty"} history and preserves the delivery lock`, async (t) => {
    stub(t, prisma.externalClaimSubmission, "findFirst", async () => ({
      id: 1,
      deliveryState: "UNKNOWN",
      member: { controllerId: "123456" },
    }));
    t.mock.method(claimsProvider, "isConfigured", () => true);
    t.mock.method(claimsProvider, "history", async (staffId: string) => {
      assert.equal(staffId, "123456");
      return history;
    });
    stub(
      t,
      prisma.externalClaimSubmission,
      "updateMany",
      async (args: Prisma.ExternalClaimSubmissionUpdateManyArgs) => {
        assert.equal(args.where?.deliveryState, "UNKNOWN");
        return { count: 0 }; // Another attempt already holds the delivery lock.
      },
    );
    stub(t, prisma.externalClaimSubmission, "findUniqueOrThrow", async () => ({
      id: 1,
      deliveryState: "SENDING",
    }));
    stub(t, prisma.auditLog, "create", async () => ({}));
    const send = t.mock.method(claimsProvider, "createSubmission", async () => {
      throw new Error("must not send twice");
    });
    const res = response();
    await routeHandler(claimsRouter, "/submissions/:id/send")(
      { params: { id: "1" }, body: { historyChecked: true } },
      res,
    );
    assert.equal(res.code, 200);
    assert.equal(send.mock.callCount(), 0);
  });
}

test("saved-claim recovery is scoped and only reaches a claim in a deliverable state", async (t) => {
  const history = t.mock.method(claimsProvider, "history", async () => []);
  stub(
    t,
    prisma.externalClaimSubmission,
    "findFirst",
    async (
      args: Prisma.ExternalClaimSubmissionFindFirstArgs & {
        where: Prisma.ExternalClaimSubmissionWhereInput;
      },
    ) => {
      // NOT_SENT (never attempted) plus FAILED/UNKNOWN (a previous attempt that was rejected or
      // never got a confirmed outcome) are all retryable from here -- SENDING and ACCEPTED are
      // deliberately not in this set, since a delivery already in flight or already accepted
      // must never be reachable through this route. See claims.delivery.test.ts for deliverClaim's
      // own enforcement of the same boundary.
      assert.deepEqual(args.where.deliveryState, { in: ["NOT_SENT", "FAILED", "UNKNOWN"] });
      assert.equal(args.where.provider, "Claims System");
      assert.equal(args.where.member?.is?.districtId, 9);
      assert.deepEqual(args.where.OR?.[1], { source: "MEMBER_PORTAL", reviewedAt: { not: null } });
      return null;
    },
  );
  const remote = t.mock.method(claimsProvider, "createSubmission", async () => ({
    externalClaimId: "MK-1",
    status: "SUBMITTED" as const,
  }));
  const res = response();
  await routeHandler(claimsRouter, "/submissions/:id/send")({ params: { id: "1" } }, res);
  assert.equal(res.code, 409);
  assert.equal(remote.mock.callCount(), 0);
  assert.equal(history.mock.callCount(), 0);
});

for (const failure of ["unavailable", "wrong-member", "wrong-reference"]) {
  test(`assessment snapshot is not overwritten when the provider is ${failure}`, async (t) => {
    stub(t, prisma.externalClaimSubmission, "findFirst", async () => ({
      id: 1,
      member: { controllerId: "123456" },
    }));
    t.mock.method(claimsProvider, "details", async () => {
      if (failure === "unavailable") throw new Error("offline");
      return {
        id: failure === "wrong-reference" ? "other" : "42",
        staffId: failure === "wrong-member" ? "654321" : "123456",
        claimNumber: "MC-42",
        name: null,
        claimDate: null,
        amountPayable: "0",
        status: "Paid",
        rejectReason: null,
      };
    });
    stub(t, prisma.externalClaimSubmission, "update", async () =>
      assert.fail("must retain saved assessment and timestamp"),
    );
    const res = response();
    await routeHandler(claimsRouter, "/claimdetails/:externalId")(
      { params: { externalId: "42" } },
      res,
    );
    assert.equal(res.code, 502);
  });
}

test("review return records the decision atomically without sending a claim", async (t) => {
  stub(t, prisma.externalClaimSubmission, "findFirst", async () => ({
    id: 1,
    claimType: "DEATH",
    memberId: 7,
    member: { fullName: "Test", districtId: 9 },
  }));
  stub(
    t,
    prisma.externalClaimSubmission,
    "updateMany",
    async (
      args: Prisma.ExternalClaimSubmissionUpdateManyArgs & {
        where: Prisma.ExternalClaimSubmissionWhereInput;
      },
    ) => {
      assert.equal(args.where.reviewedAt, null);
      assert.equal(args.where.deliveryState, "NOT_SENT");
      assert.equal(args.data.status, "RETURNED");
      return { count: 1 };
    },
  );
  stub(t, prisma.externalClaimSubmission, "findUniqueOrThrow", async () => ({
    id: 1,
    status: "RETURNED",
  }));
  stub(t, prisma.auditLog, "create", async () => ({}));
  const notification = stub(
    t,
    prisma.notification,
    "upsert",
    async (args: Prisma.NotificationUpsertArgs) => {
      assert.equal(args.create.memberId, 7);
      assert.equal(args.create.actionUrl, "/member/claims/1/resubmit");
      assert.match(args.create.message, /Replace document/);
      return {};
    },
  );
  const remote = t.mock.method(claimsProvider, "createSubmission", async () => ({
    externalClaimId: "MK-1",
    status: "SUBMITTED" as const,
  }));
  const res = response();
  await routeHandler(claimsRouter, "/submissions/:id/review")(
    { params: { id: "1" }, body: { action: "RETURN", note: "Replace document" } },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal(remote.mock.callCount(), 0);
  assert.equal(notification.mock.callCount(), 1);
});

test("a concurrent or repeated review cannot create another notification", async (t) => {
  stub(t, prisma.externalClaimSubmission, "findFirst", async () => ({
    id: 1,
    memberId: 7,
    member: { fullName: "Test" },
  }));
  stub(t, prisma.externalClaimSubmission, "updateMany", async () => ({ count: 0 }));
  const write = stub(t, prisma.notification, "upsert", async () =>
    assert.fail("must not notify twice"),
  );
  const res = response();
  await routeHandler(claimsRouter, "/submissions/:id/review")(
    { params: { id: "1" }, body: { action: "RETURN", note: "Fix report" } },
    res,
  );
  assert.equal(res.code, 409);
  assert.equal(write.mock.callCount(), 0);
});

test("a notification storage failure still returns a successful committed review", async (t) => {
  stub(t, prisma.externalClaimSubmission, "findFirst", async () => ({
    id: 1,
    memberId: 7,
    member: { fullName: "Test" },
  }));
  stub(t, prisma.externalClaimSubmission, "updateMany", async () => ({ count: 1 }));
  stub(t, prisma.externalClaimSubmission, "findUniqueOrThrow", async () => ({
    id: 1,
    status: "FAILED",
  }));
  stub(t, prisma.auditLog, "create", async () => ({}));
  stub(t, prisma.notification, "upsert", async () => {
    throw new Error("offline");
  });
  const res = response();
  await routeHandler(claimsRouter, "/submissions/:id/review")(
    { params: { id: "1" }, body: { action: "REJECT", note: "Invalid report" } },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal((res.body as { data: { status: string } }).data.status, "FAILED");
});
