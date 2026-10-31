import assert from "node:assert/strict";
import test from "node:test";

import { postHandler, routeHandler, stub } from "../../test/fixtures.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { transferRouter } from "./transfer.routes.js";

function response(role = "SUPER_ADMIN", id = 1) {
  return {
    locals: { user: { id, role, regionId: null, districtId: null } },
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

// Shared across tests that reach a successful write and go on to notifyMember() -- a null
// member short-circuits its SMS branch, leaving only the in-app upsert to stub.
function stubNotifications(t: Parameters<typeof stub>[0]) {
  stub(t, prisma.member, "findUnique", async () => null);
  stub(t, prisma.notification, "upsert", async () => ({}));
  stub(t, prisma.auditLog, "create", async () => ({}));
}

test("a removed member cannot be transferred", async (t) => {
  stub(t, prisma.member, "findFirst", async () => ({
    id: 1,
    status: "REMOVED",
    districtId: 4,
    district: { regionId: 2, name: "Test District" },
  }));
  const res = response();
  await postHandler(transferRouter, "/")(
    { body: { memberId: 1, toDistrictId: 5, reason: "Relocation" } },
    res,
  );
  assert.equal(res.code, 409);
  assert.match(message(res.body), /removed member/i);
});

test("a member with no district on file cannot be transferred", async (t) => {
  stub(t, prisma.member, "findFirst", async () => ({
    id: 1,
    status: "ACTIVE",
    districtId: null,
    district: null,
  }));
  const res = response();
  await postHandler(transferRouter, "/")(
    { body: { memberId: 1, toDistrictId: 5, reason: "Relocation" } },
    res,
  );
  assert.equal(res.code, 409);
  assert.match(message(res.body), /no district on file/i);
});

test("the destination district must differ from the current one", async (t) => {
  stub(t, prisma.member, "findFirst", async () => ({
    id: 1,
    status: "ACTIVE",
    districtId: 5,
    district: { regionId: 2, name: "Current District" },
  }));
  const res = response();
  await postHandler(transferRouter, "/")(
    { body: { memberId: 1, toDistrictId: 5, reason: "Relocation" } },
    res,
  );
  assert.equal(res.code, 400);
  assert.match(message(res.body), /differ from the current district/i);
});

test("a nonexistent destination district is rejected", async (t) => {
  stub(t, prisma.member, "findFirst", async () => ({
    id: 1,
    status: "ACTIVE",
    districtId: 4,
    district: { regionId: 2, name: "Current District" },
  }));
  stub(t, prisma.district, "findUnique", async () => null);
  const res = response();
  await postHandler(transferRouter, "/")(
    { body: { memberId: 1, toDistrictId: 999, reason: "Relocation" } },
    res,
  );
  assert.equal(res.code, 400);
  assert.match(message(res.body), /does not exist/i);
});

test("a member cannot have two pending transfers at once", async (t) => {
  stub(t, prisma.member, "findFirst", async () => ({
    id: 1,
    status: "ACTIVE",
    districtId: 4,
    district: { regionId: 2, name: "Current District" },
  }));
  stub(t, prisma.district, "findUnique", async () => ({ id: 5, regionId: 3, name: "Dest" }));
  stub(t, prisma.memberTransfer, "findUnique", async () => ({ id: 10 }));
  const res = response();
  await postHandler(transferRouter, "/")(
    { body: { memberId: 1, toDistrictId: 5, reason: "Relocation" } },
    res,
  );
  assert.equal(res.code, 409);
  assert.match(message(res.body), /already has a pending transfer/i);
});

test("a transfer request racing a concurrent duplicate gets a clean 409, not a 500", async (t) => {
  stub(t, prisma.member, "findFirst", async () => ({
    id: 1,
    status: "ACTIVE",
    districtId: 4,
    district: { regionId: 2, name: "Current District" },
  }));
  stub(t, prisma.district, "findUnique", async () => ({ id: 5, regionId: 3, name: "Dest" }));
  stub(t, prisma.memberTransfer, "findUnique", async () => null);
  stub(t, prisma.memberTransfer, "create", async () => {
    throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["active_key"] },
    });
  });
  const res = response();
  await postHandler(transferRouter, "/")(
    { body: { memberId: 1, toDistrictId: 5, reason: "Relocation" } },
    res,
  );
  assert.equal(res.code, 409);
  assert.match(message(res.body), /already has a pending transfer/i);
});

test("only a pending transfer can be reviewed", async (t) => {
  stub(t, prisma.memberTransfer, "findFirst", async () => ({ id: 1, status: "APPROVED" }));
  const res = response();
  await routeHandler(
    transferRouter,
    "/:id/review",
    "patch",
  )({ params: { id: "1" }, body: { decision: "APPROVED" } }, res);
  assert.equal(res.code, 409);
  assert.match(message(res.body), /only pending transfers/i);
});

test("approving a transfer moves the member's district and region together", async (t) => {
  stubNotifications(t);
  stub(t, prisma.memberTransfer, "findFirst", async () => ({
    id: 1,
    status: "PENDING",
    memberId: 7,
    fromDistrictId: 4,
    toDistrictId: 5,
    toDistrict: { regionId: 9 },
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.memberTransfer, "updateMany", async () => ({ count: 1 }));
  let movedData: unknown;
  stub(t, prisma.member, "updateMany", async ({ data }: { data: unknown }) => {
    movedData = data;
    return { count: 1 };
  });
  stub(t, prisma.memberTransfer, "findUniqueOrThrow", async () => ({
    id: 1,
    status: "APPROVED",
    memberId: 7,
    fromDistrictId: 4,
    toDistrictId: 5,
    reviewNote: null,
    member: { fullName: "Test Member" },
    toDistrict: { regionId: 9, name: "Dest District" },
    fromDistrict: { regionId: 2, name: "Source District" },
  }));
  const res = response();
  await routeHandler(
    transferRouter,
    "/:id/review",
    "patch",
  )({ params: { id: "1" }, body: { decision: "APPROVED" } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(movedData, { districtId: 5, regionId: 9 });
});

test("a transfer approved out from under a member who already left the source district fails cleanly", async (t) => {
  stub(t, prisma.memberTransfer, "findFirst", async () => ({
    id: 1,
    status: "PENDING",
    memberId: 7,
    fromDistrictId: 4,
    toDistrictId: 5,
    toDistrict: { regionId: 9 },
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.memberTransfer, "updateMany", async () => ({ count: 1 }));
  stub(t, prisma.member, "updateMany", async () => ({ count: 0 }));
  const res = response();
  await routeHandler(
    transferRouter,
    "/:id/review",
    "patch",
  )({ params: { id: "1" }, body: { decision: "APPROVED" } }, res);
  assert.equal(res.code, 409);
  assert.match(message(res.body), /no longer in the source district/i);
});

test("a transfer the reviewing admin loses the race on is reported as already reviewed", async (t) => {
  stub(t, prisma.memberTransfer, "findFirst", async () => ({
    id: 1,
    status: "PENDING",
    memberId: 7,
    fromDistrictId: 4,
    toDistrictId: 5,
    toDistrict: { regionId: 9 },
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.memberTransfer, "updateMany", async () => ({ count: 0 }));
  const res = response();
  await routeHandler(
    transferRouter,
    "/:id/review",
    "patch",
  )({ params: { id: "1" }, body: { decision: "APPROVED" } }, res);
  assert.equal(res.code, 409);
  assert.match(message(res.body), /already reviewed/i);
});

test("only the requester or a national-level admin can cancel a transfer", async (t) => {
  stub(t, prisma.memberTransfer, "findFirst", async () => ({
    id: 1,
    status: "PENDING",
    requestedById: 99,
  }));
  const res = response("DISTRICT_ADMIN", 1);
  await routeHandler(
    transferRouter,
    "/:id/cancel",
    "patch",
  )({ params: { id: "1" }, body: {} }, res);
  assert.equal(res.code, 403);
  assert.match(message(res.body), /cannot cancel/i);
});

test("the original requester can cancel their own pending transfer", async (t) => {
  stubNotifications(t);
  stub(t, prisma.memberTransfer, "findFirst", async () => ({
    id: 1,
    status: "PENDING",
    memberId: 7,
    requestedById: 1,
  }));
  stub(t, prisma.memberTransfer, "updateMany", async () => ({ count: 1 }));
  stub(t, prisma.memberTransfer, "findUniqueOrThrow", async () => ({
    id: 1,
    status: "CANCELLED",
    memberId: 7,
    reviewNote: null,
    member: { fullName: "Test Member" },
    fromDistrict: { regionId: 2 },
    fromDistrictId: 4,
    toDistrict: { name: "Dest District" },
  }));
  const res = response("DISTRICT_ADMIN", 1);
  await routeHandler(
    transferRouter,
    "/:id/cancel",
    "patch",
  )({ params: { id: "1" }, body: {} }, res);
  assert.equal(res.code, 200);
});

test("only a pending transfer can be cancelled", async (t) => {
  stub(t, prisma.memberTransfer, "findFirst", async () => ({
    id: 1,
    status: "PENDING",
    requestedById: 1,
  }));
  stub(t, prisma.memberTransfer, "updateMany", async () => ({ count: 0 }));
  const res = response("DISTRICT_ADMIN", 1);
  await routeHandler(
    transferRouter,
    "/:id/cancel",
    "patch",
  )({ params: { id: "1" }, body: {} }, res);
  assert.equal(res.code, 409);
  assert.match(message(res.body), /only pending transfers/i);
});
