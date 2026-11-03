import assert from "node:assert/strict";
import test from "node:test";

import { routeHandler, stub } from "../../test/fixtures.js";
import { prisma } from "../../lib/prisma.js";
import { externalRouter } from "./external.routes.js";

function response() {
  return {
    locals: {},
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

test("a pathologically long controller ID is rejected before reaching the database", async (t) => {
  const find = stub(t, prisma.member, "findUnique", async () => null);
  const res = response();
  await routeHandler(
    externalRouter,
    "/members/:controllerId",
    "get",
  )({ params: { controllerId: "x".repeat(129) } }, res);
  assert.equal(res.code, 404);
  assert.equal(find.mock.callCount(), 0);
});

test("an unknown controller ID returns the same not-found shape as a removed member", async (t) => {
  stub(t, prisma.member, "findUnique", async () => null);
  const res = response();
  await routeHandler(
    externalRouter,
    "/members/:controllerId",
    "get",
  )({ params: { controllerId: "GNATNT2020999" } }, res);
  assert.equal(res.code, 404);
  assert.equal((res.body as { code: string }).code, "EXTERNAL_MEMBER_NOT_FOUND");
});

test("a removed member is reported as not found, not disclosed as removed", async (t) => {
  stub(t, prisma.member, "findUnique", async () => ({
    controllerId: "GNATNT2020001",
    fullName: "Test Member",
    status: "REMOVED",
    school: "Test School",
    ghanaCardId: null,
    phone: null,
    phoneVerifiedAt: null,
    email: null,
    district: null,
    spouse: null,
  }));
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await routeHandler(
    externalRouter,
    "/members/:controllerId",
    "get",
  )({ params: { controllerId: "GNATNT2020001" } }, res);
  assert.equal(res.code, 404);
  assert.equal((res.body as { code: string }).code, "EXTERNAL_MEMBER_NOT_FOUND");
});

test("an active member is returned with district/region flattened and phone verification as a boolean", async (t) => {
  stub(t, prisma.member, "findUnique", async () => ({
    controllerId: "GNATNT2020001",
    fullName: "Test Member",
    status: "ACTIVE",
    school: "Test School",
    ghanaCardId: "GHA-000000000-0",
    phone: "0200000000",
    phoneVerifiedAt: new Date(),
    email: "member@example.com",
    district: { name: "Test District", region: { name: "Test Region" } },
    spouse: { fullName: "Test Spouse", ghanaCardId: "GHA-111111111-1" },
  }));
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await routeHandler(
    externalRouter,
    "/members/:controllerId",
    "get",
  )({ params: { controllerId: "GNATNT2020001" } }, res);
  assert.equal(res.code, 200);
  const data = (res.body as { data: Record<string, unknown> }).data;
  assert.equal(data.district, "Test District");
  assert.equal(data.region, "Test Region");
  assert.equal(data.phoneVerified, true);
  assert.deepEqual(data.spouse, { fullName: "Test Spouse", ghanaCardId: "GHA-111111111-1" });
});

test("an active member with no district on file reports null district and region", async (t) => {
  stub(t, prisma.member, "findUnique", async () => ({
    controllerId: "GNATNT2020001",
    fullName: "Test Member",
    status: "ACTIVE",
    school: "Test School",
    ghanaCardId: null,
    phone: null,
    phoneVerifiedAt: null,
    email: null,
    district: null,
    spouse: null,
  }));
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await routeHandler(
    externalRouter,
    "/members/:controllerId",
    "get",
  )({ params: { controllerId: "GNATNT2020001" } }, res);
  assert.equal(res.code, 200);
  const data = (res.body as { data: Record<string, unknown> }).data;
  assert.equal(data.district, null);
  assert.equal(data.region, null);
  assert.equal(data.spouse, null);
});
