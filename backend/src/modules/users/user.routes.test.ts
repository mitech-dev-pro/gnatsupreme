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
    locals: { user: { id, role, regionIds: [], districtIds: [] } },
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
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.user, "updateMany", async () => ({ count: 0 }));
  stub(t, prisma.user, "findFirst", async () => ({ id: 9 }));
  const res = response("SUPER_ADMIN");
  await postHandler(userRouter, "/")(
    {
      body: {
        fullName: "Test Admin",
        email: "taken@example.com",
        role: "DISTRICT_ADMIN",
        districtIds: [4],
        password: "Str0ng!NewPassw0rd",
      },
    },
    res,
  );
  assert.equal(res.code, 409);
  assert.match(message(res.body), /already in use/i);
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
    districtIds: [4],
    regionIds: [2],
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
    regionIds: [2],
    districtIds: [4],
  }));
  // The route builds an array of already-invoked Prisma calls and hands it to
  // prisma.$transaction([...]) -- stubbing $transaction to just await that array mirrors the
  // real atomic-batch form closely enough to exercise the route's own logic.
  stub(t, prisma, "$transaction", async (queries: unknown[]) => Promise.all(queries));
  stub(t, prisma.user, "update", async () => ({
    id: 6,
    isActive: false,
    fullName: "Test Staff",
    setupFailedAttempts: 0,
    regionIds: [2],
    districtIds: [4],
  }));
  stub(t, prisma.region, "findMany", async () => []);
  stub(t, prisma.district, "findMany", async () => []);
  stub(t, prisma, "$queryRaw", async () => []);
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
    email: "classic@example.test",
    phone: null,
    regionIds: [2],
    districtIds: [4],
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
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

test("an admin can clear a confirmed email as long as a phone number remains", async (t) => {
  stubCache(t);
  stub(t, prisma.user, "findUnique", async () => ({
    id: 8,
    role: "DISTRICT_ADMIN",
    email: "confirmed@example.test",
    setupRequired: false,
    phone: "0244000000",
    regionIds: [2],
    districtIds: [4],
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  const deleteTokens = stub(
    t,
    prisma.userPasswordResetToken,
    "deleteMany",
    async (args: { where: { userId: number; consumedAt: null } }) => {
      assert.deepEqual(args.where, { userId: 8, consumedAt: null });
      return { count: 1 };
    },
  );
  const update = stub(t, prisma.user, "update", async (args: { data: Record<string, unknown> }) => {
    assert.equal(args.data.email, null);
    return {
      id: 8,
      role: "DISTRICT_ADMIN",
      email: null,
      phone: "0244000000",
      setupRequired: false,
      setupFailedAttempts: 0,
      regionIds: [2],
      districtIds: [4],
      createdAt: new Date(),
    };
  });
  stub(t, prisma.auditLog, "create", async () => ({}));
  stub(t, prisma.region, "findMany", async () => []);
  stub(t, prisma.district, "findMany", async () => [{ id: 4, regionId: 2, name: "Test District" }]);
  stub(t, prisma, "$queryRaw", async () => []);
  const res = response("SUPER_ADMIN");
  await routeHandler(
    userRouter,
    "/:id",
    "patch",
  )({ params: { id: "8" }, body: { email: null } }, res);
  assert.equal(res.code, 200);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(deleteTokens.mock.callCount(), 1);
});

test("an admin cannot clear email when phone would also be null -- no identifier left", async (t) => {
  stub(t, prisma.user, "findUnique", async () => ({
    id: 8,
    role: "DISTRICT_ADMIN",
    email: "confirmed@example.test",
    setupRequired: false,
    phone: null,
    regionIds: [2],
    districtIds: [4],
  }));
  const res = response("SUPER_ADMIN");
  await routeHandler(
    userRouter,
    "/:id",
    "patch",
  )({ params: { id: "8" }, body: { email: null } }, res);
  assert.equal(res.code, 400);
  assert.match(message(res.body), /needs an email address or a phone number/i);
});

test("an admin clearing phone on an account with no email is rejected", async (t) => {
  stub(t, prisma.user, "findUnique", async () => ({
    id: 9,
    role: "DISTRICT_ADMIN",
    email: null,
    setupRequired: true,
    phone: "0244000000",
    regionIds: [2],
    districtIds: [4],
  }));
  const res = response("SUPER_ADMIN");
  await routeHandler(
    userRouter,
    "/:id",
    "patch",
  )({ params: { id: "9" }, body: { phone: null } }, res);
  assert.equal(res.code, 400);
  assert.match(message(res.body), /needs an email address or a phone number/i);
});

test("an admin setting an email writes it directly and deletes outstanding reset tokens", async (t) => {
  stubCache(t);
  stub(t, prisma.user, "findUnique", async () => ({
    id: 10,
    role: "DISTRICT_ADMIN",
    email: "old@example.test",
    setupRequired: false,
    phone: "0244000000",
    regionIds: [2],
    districtIds: [4],
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.user, "findFirst", async () => null);
  const deleteTokens = stub(t, prisma.userPasswordResetToken, "deleteMany", async () => ({
    count: 1,
  }));
  const update = stub(t, prisma.user, "update", async (args: { data: Record<string, unknown> }) => {
    assert.equal(args.data.email, "staff@example.test");
    return {
      id: 10,
      role: "DISTRICT_ADMIN",
      email: "staff@example.test",
      phone: "0244000000",
      setupRequired: false,
      setupFailedAttempts: 0,
      regionIds: [2],
      districtIds: [4],
      createdAt: new Date(),
    };
  });
  stub(t, prisma.auditLog, "create", async () => ({}));
  stub(t, prisma.region, "findMany", async () => []);
  stub(t, prisma.district, "findMany", async () => [{ id: 4, regionId: 2, name: "Test District" }]);
  stub(t, prisma, "$queryRaw", async () => []);
  const res = response("SUPER_ADMIN");
  await routeHandler(
    userRouter,
    "/:id",
    "patch",
  )({ params: { id: "10" }, body: { email: "staff@example.test" } }, res);
  assert.equal(res.code, 200);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(deleteTokens.mock.callCount(), 1);
});

test("an admin password reset on a phone-capable account re-arms setup and clears the email", async (t) => {
  stubCache(t);
  stub(t, prisma.user, "findUnique", async () => ({
    id: 11,
    role: "DISTRICT_ADMIN",
    email: "confirmed@example.test",
    phone: "0244000000",
    setupRequired: true,
    regionIds: [2],
    districtIds: [4],
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  const update = stub(t, prisma.user, "update", async (args: { data: Record<string, unknown> }) => {
    assert.equal(args.data.setupRequired, true);
    assert.ok(args.data.setupArmedAt instanceof Date);
    assert.equal(args.data.setupFailedAttempts, 0);
    assert.equal(args.data.email, null);
    return undefined;
  });
  const deleteTokens = stub(t, prisma.userPasswordResetToken, "deleteMany", async () => ({
    count: 1,
  }));
  stub(t, prisma.refreshToken, "updateMany", async () => ({ count: 1 }));
  const audit = stub(
    t,
    prisma.auditLog,
    "create",
    async (args: { data: Record<string, unknown> }) => {
      assert.deepEqual(args.data.beforeData, { email: "confirmed@example.test" });
      assert.deepEqual(args.data.afterData, { email: null });
      return {};
    },
  );
  const res = response("SUPER_ADMIN", 1);
  await routeHandler(
    userRouter,
    "/:id/password",
    "patch",
  )({ params: { id: "11" }, body: { password: "Str0ng!NewPassw0rd" } }, res);
  assert.equal(res.code, 200);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(deleteTokens.mock.callCount(), 1);
  assert.equal(audit.mock.callCount(), 1);
});

test("an admin password reset on a classic email-only admin is a plain reset, no re-arm", async (t) => {
  stubCache(t);
  stub(t, prisma.user, "findUnique", async () => ({
    id: 12,
    role: "DISTRICT_ADMIN",
    email: "classic@example.test",
    phone: null,
    setupRequired: false,
    regionIds: [2],
    districtIds: [4],
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  const update = stub(t, prisma.user, "update", async (args: { data: Record<string, unknown> }) => {
    assert.equal(args.data.setupRequired, undefined);
    assert.equal(args.data.email, undefined);
    return undefined;
  });
  stub(t, prisma.refreshToken, "updateMany", async () => ({ count: 1 }));
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response("SUPER_ADMIN", 1);
  await routeHandler(
    userRouter,
    "/:id/password",
    "patch",
  )({ params: { id: "12" }, body: { password: "Str0ng!NewPassw0rd" } }, res);
  assert.equal(res.code, 200);
  assert.equal(update.mock.callCount(), 1);
});
