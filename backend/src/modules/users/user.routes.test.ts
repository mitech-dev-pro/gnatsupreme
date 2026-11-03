import assert from "node:assert/strict";
import test from "node:test";
import { Redis } from "ioredis";

import { postHandler, routeHandler, stub } from "../../test/fixtures.js";
import { prisma } from "../../lib/prisma.js";
import { userRouter } from "./user.routes.js";

// Prevents invalidateStaffAuth()'s cache delete from attempting a real connection to Redis --
// same rationale as claims.submission.test.ts's fixture().
function stubCache(t: Parameters<typeof stub>[0]) {
  stub(t, Redis.prototype, "connect", async () => undefined);
  stub(t, Redis.prototype, "del", async () => 1);
}

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

test("a NATIONAL_ADMIN cannot create a super administrator", async (t) => {
  stub(t, prisma.user, "findUnique", async () => null);
  const res = response("NATIONAL_ADMIN");
  await postHandler(userRouter, "/")(
    {
      body: {
        fullName: "Test Admin",
        email: "new-admin@example.com",
        role: "SUPER_ADMIN",
        password: "Str0ng!NewPassw0rd",
      },
    },
    res,
  );
  assert.equal(res.code, 403);
  assert.match(message(res.body), /super administrator/i);
});

test("creating a user with an email already in use is rejected", async (t) => {
  stub(t, prisma.user, "findUnique", async () => ({ id: 9 }));
  const res = response("SUPER_ADMIN");
  await postHandler(userRouter, "/")(
    {
      body: {
        fullName: "Test Admin",
        email: "taken@example.com",
        role: "DISTRICT_ADMIN",
        districtId: 4,
        password: "Str0ng!NewPassw0rd",
      },
    },
    res,
  );
  assert.equal(res.code, 409);
  assert.match(message(res.body), /already exists/i);
});

test("a district administrator requires a district assignment", async (t) => {
  stub(t, prisma.user, "findUnique", async () => null);
  const res = response("SUPER_ADMIN");
  await postHandler(userRouter, "/")(
    {
      body: {
        fullName: "Test Admin",
        email: "new-district-admin@example.com",
        role: "DISTRICT_ADMIN",
        password: "Str0ng!NewPassw0rd",
      },
    },
    res,
  );
  assert.equal(res.code, 400);
  assert.match(message(res.body), /requires a district/i);
});

test("a NATIONAL_ADMIN cannot view or edit a super administrator", async (t) => {
  stub(t, prisma.user, "findUnique", async () => ({
    id: 3,
    role: "SUPER_ADMIN",
    email: "super@example.com",
  }));
  const res = response("NATIONAL_ADMIN");
  await routeHandler(
    userRouter,
    "/:id",
    "patch",
  )({ params: { id: "3" }, body: { fullName: "Renamed" } }, res);
  assert.equal(res.code, 404);
});

test("a NATIONAL_ADMIN cannot promote a user to super administrator", async (t) => {
  stub(t, prisma.user, "findUnique", async () => ({
    id: 5,
    role: "DISTRICT_ADMIN",
    email: "staff@example.com",
    districtId: 4,
    regionId: 2,
  }));
  const res = response("NATIONAL_ADMIN");
  await routeHandler(
    userRouter,
    "/:id",
    "patch",
  )({ params: { id: "5" }, body: { role: "SUPER_ADMIN" } }, res);
  assert.equal(res.code, 403);
  assert.match(message(res.body), /super administrator/i);
});

test("an administrator cannot deactivate their own account", async () => {
  const res = response("SUPER_ADMIN", 1);
  await routeHandler(
    userRouter,
    "/:id/status",
    "patch",
  )({ params: { id: "1" }, body: { isActive: false } }, res);
  assert.equal(res.code, 400);
  assert.match(message(res.body), /cannot deactivate your own account/i);
});

test("the final active super administrator cannot be deactivated", async (t) => {
  stub(t, prisma.user, "findUnique", async () => ({
    id: 2,
    role: "SUPER_ADMIN",
    isActive: true,
  }));
  stub(t, prisma.user, "count", async () => 1);
  const res = response("SUPER_ADMIN", 1);
  await routeHandler(
    userRouter,
    "/:id/status",
    "patch",
  )({ params: { id: "2" }, body: { isActive: false } }, res);
  assert.equal(res.code, 409);
  assert.match(message(res.body), /final super administrator/i);
});

test("deactivating a user revokes their active sessions and invalidates the auth cache", async (t) => {
  stubCache(t);
  stub(t, prisma.user, "findUnique", async () => ({
    id: 6,
    role: "DISTRICT_ADMIN",
    isActive: true,
    fullName: "Test Staff",
    regionId: 2,
    districtId: 4,
  }));
  // The route builds an array of already-invoked Prisma calls and hands it to
  // prisma.$transaction([...]) -- stubbing $transaction to just await that array mirrors the
  // real atomic-batch form closely enough to exercise the route's own logic.
  stub(t, prisma, "$transaction", async (queries: unknown[]) => Promise.all(queries));
  stub(t, prisma.user, "update", async () => ({
    id: 6,
    isActive: false,
    fullName: "Test Staff",
    regionId: 2,
    districtId: 4,
  }));
  let revokedWhere: { userId: number; revokedAt: null } | undefined;
  stub(t, prisma.refreshToken, "updateMany", async ({ where }: { where: typeof revokedWhere }) => {
    revokedWhere = where;
    return { count: 1 };
  });
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response("SUPER_ADMIN", 1);
  await routeHandler(
    userRouter,
    "/:id/status",
    "patch",
  )({ params: { id: "6" }, body: { isActive: false } }, res);
  assert.equal(res.code, 200);
  assert.equal(revokedWhere?.userId, 6);
});

test("resetting a user's password revokes their active sessions", async (t) => {
  stubCache(t);
  stub(t, prisma.user, "findUnique", async () => ({
    id: 7,
    role: "DISTRICT_ADMIN",
    fullName: "Test Staff",
    regionId: 2,
    districtId: 4,
  }));
  stub(t, prisma, "$transaction", async (queries: unknown[]) => Promise.all(queries));
  stub(t, prisma.user, "update", async () => undefined);
  let revokedUserId: number | undefined;
  stub(t, prisma.refreshToken, "updateMany", async ({ where }: { where: { userId: number } }) => {
    revokedUserId = where.userId;
    return { count: 1 };
  });
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response("SUPER_ADMIN", 1);
  await routeHandler(
    userRouter,
    "/:id/password",
    "patch",
  )({ params: { id: "7" }, body: { password: "Str0ng!NewPassw0rd" } }, res);
  assert.equal(res.code, 200);
  assert.equal(revokedUserId, 7);
  assert.match(message(res.body) ?? "", /revoked/i);
});
