import assert from "node:assert/strict";
import test from "node:test";
import argon2 from "argon2";
import { Redis } from "ioredis";

import { stub, routeHandler, postHandler } from "../../test/fixtures.js";
import { prisma } from "../../lib/prisma.js";
import { authRouter } from "./auth.routes.js";
import { hashPasswordResetToken } from "./auth.tokens.js";

// No real Redis in tests -- invalidateStaffAuth()'s cache delete falls through once the
// connection attempt fails, same rationale as every other test touching staff auth caching.
function stubCache(t: Parameters<typeof stub>[0]) {
  stub(t, Redis.prototype, "connect", async () => undefined);
  stub(t, Redis.prototype, "del", async () => 1);
}

let testPasswordHash: string;
test.before(async () => {
  testPasswordHash = await argon2.hash("Str0ng!TestPassw0rd", {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
});

function response() {
  return {
    locals: {} as Record<string, unknown>,
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
    cookie() {
      return this;
    },
    clearCookie() {
      return this;
    },
  };
}

test("forgot-password gives the same response whether or not the email exists", async (t) => {
  stub(t, prisma.user, "findFirst", async () => null);
  const create = stub(t, prisma.userPasswordResetToken, "create", async () =>
    assert.fail("must not create a token for an unknown email"),
  );
  const res = response();
  await routeHandler(
    authRouter,
    "/forgot-password",
    "post",
  )({ body: { email: "nobody@example.test" } }, res);
  assert.equal(res.code, 200);
  assert.equal(create.mock.callCount(), 0);
  assert.match((res.body as { message: string }).message, /password reset instructions/i);
});

test("forgot-password creates a token for a known, active email with the same response shape", async (t) => {
  stub(t, prisma.user, "findFirst", async () => ({ id: 3, email: "admin@example.test" }));
  const create = stub(
    t,
    prisma.userPasswordResetToken,
    "create",
    async (args: { data: { userId: number } }) => {
      assert.equal(args.data.userId, 3);
      return {};
    },
  );
  const res = response();
  await routeHandler(
    authRouter,
    "/forgot-password",
    "post",
  )({ body: { email: "admin@example.test" } }, res);
  assert.equal(res.code, 200);
  assert.equal(create.mock.callCount(), 1);
  assert.match((res.body as { message: string }).message, /password reset instructions/i);
});

test("reset-password rejects a consumed, expired, or inactive-user token", async (t) => {
  stub(t, prisma.userPasswordResetToken, "findUnique", async () => ({
    id: 1,
    userId: 3,
    consumedAt: null,
    expiresAt: new Date(Date.now() - 1_000),
    user: { id: 3, fullName: "Test Admin", isActive: true },
  }));
  const res = response();
  await routeHandler(
    authRouter,
    "/reset-password",
    "post",
  )({ body: { token: "a".repeat(64), password: "Str0ng!NewPassw0rd" } }, res);
  assert.equal(res.code, 401);
});

test("reset-password updates the hash, revokes sessions, and consumes the token exactly once", async (t) => {
  stubCache(t);
  const tokenHash = hashPasswordResetToken("b".repeat(64));
  stub(
    t,
    prisma.userPasswordResetToken,
    "findUnique",
    async (args: { where: { tokenHash: string } }) => {
      assert.equal(args.where.tokenHash, tokenHash);
      return {
        id: 1,
        userId: 3,
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 3, fullName: "Test Admin", isActive: true },
      };
    },
  );
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  const consume = stub(
    t,
    prisma.userPasswordResetToken,
    "updateMany",
    async (args: { where: { id: number; consumedAt: null } }) => {
      assert.deepEqual(args.where, { id: 1, consumedAt: null });
      return { count: 1 };
    },
  );
  const update = stub(t, prisma.user, "update", async (args: { where: { id: number } }) => {
    assert.equal(args.where.id, 3);
    return {};
  });
  const revoke = stub(
    t,
    prisma.refreshToken,
    "updateMany",
    async (args: { where: { userId: number; revokedAt: null } }) => {
      assert.deepEqual(args.where, { userId: 3, revokedAt: null });
      return { count: 1 };
    },
  );
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await routeHandler(
    authRouter,
    "/reset-password",
    "post",
  )({ body: { token: "b".repeat(64), password: "Str0ng!NewPassw0rd" } }, res);
  assert.equal(res.code, 200);
  assert.equal(consume.mock.callCount(), 1);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(revoke.mock.callCount(), 1);
});

test("reset-password cannot be replayed once the token is already consumed", async (t) => {
  stub(t, prisma.userPasswordResetToken, "findUnique", async () => ({
    id: 1,
    userId: 3,
    consumedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: 3, fullName: "Test Admin", isActive: true },
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.userPasswordResetToken, "updateMany", async () => ({ count: 0 }));
  const update = stub(t, prisma.user, "update", async () =>
    assert.fail("must not update password for an already-consumed token"),
  );
  const res = response();
  await routeHandler(
    authRouter,
    "/reset-password",
    "post",
  )({ body: { token: "c".repeat(64), password: "Str0ng!NewPassw0rd" } }, res);
  assert.equal(res.code, 401);
  assert.equal(update.mock.callCount(), 0);
});

function phoneAccount(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 4,
    fullName: "Phone Admin",
    email: null,
    setupRequired: true,
    tempPasswordExpiresAt: new Date(Date.now() + 60_000),
    setupFailedAttempts: 0,
    passwordHash: testPasswordHash,
    isActive: true,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
    ...overrides,
  };
}

test("login by phone succeeds for a fresh phone-only account with the temp password", async (t) => {
  stub(t, prisma.user, "findFirst", async (args: { where: { phone: string } }) => {
    assert.equal(args.where.phone, "0244000000");
    // Confirms the lookup is no longer conditioned on email: null -- phone stays a valid
    // login identifier regardless of whether an email is set.
    assert.ok(!("email" in args.where));
    return phoneAccount();
  });
  stub(t, prisma.refreshToken, "create", async () => ({}));
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await postHandler(authRouter, "/login")(
    {
      body: { phone: "0244000000", password: "Str0ng!TestPassw0rd" },
      get: () => undefined,
    },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal((res.body as { user: { setupRequired: boolean } }).user.setupRequired, true);
});

test("login by phone still works after an email has been set -- phone never closes", async (t) => {
  stub(t, prisma.user, "findFirst", async () =>
    phoneAccount({
      setupRequired: false,
      tempPasswordExpiresAt: null,
      email: "staff@example.test",
    }),
  );
  stub(t, prisma.refreshToken, "create", async () => ({}));
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await postHandler(authRouter, "/login")(
    {
      body: { phone: "0244000000", password: "Str0ng!TestPassw0rd" },
      get: () => undefined,
    },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal((res.body as { user: { email: string } }).user.email, "staff@example.test");
});

test("login by phone is rejected the instant tempPasswordExpiresAt passes", async (t) => {
  stub(t, prisma.user, "findFirst", async () =>
    phoneAccount({ tempPasswordExpiresAt: new Date(Date.now() - 1_000) }),
  );
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await postHandler(authRouter, "/login")(
    { body: { phone: "0244000000", password: "Str0ng!TestPassw0rd" } },
    res,
  );
  assert.equal(res.code, 401);
});

test("login increments setupFailedAttempts on a wrong password while setupRequired", async (t) => {
  stub(t, prisma.user, "findFirst", async () => phoneAccount({ setupFailedAttempts: 3 }));
  const update = stub(
    t,
    prisma.user,
    "update",
    async (args: { data: { setupFailedAttempts: { increment: number } } }) => {
      assert.deepEqual(args.data, { setupFailedAttempts: { increment: 1 } });
      return {};
    },
  );
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await postHandler(authRouter, "/login")(
    { body: { phone: "0244000000", password: "WrongPassw0rd!" } },
    res,
  );
  assert.equal(res.code, 401);
  assert.equal(update.mock.callCount(), 1);
});

test("login resets setupFailedAttempts to 0 on a successful login, not only via complete-setup", async (t) => {
  stub(t, prisma.user, "findFirst", async () => phoneAccount({ setupFailedAttempts: 5 }));
  const update = stub(
    t,
    prisma.user,
    "update",
    async (args: { data: { setupFailedAttempts: number } }) => {
      assert.equal(args.data.setupFailedAttempts, 0);
      return {};
    },
  );
  stub(t, prisma.refreshToken, "create", async () => ({}));
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await postHandler(authRouter, "/login")(
    { body: { phone: "0244000000", password: "Str0ng!TestPassw0rd" }, get: () => undefined },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal(update.mock.callCount(), 1);
});

test("login hard-locks a setupRequired account at the failed-attempt threshold, even with the correct password", async (t) => {
  stub(t, prisma.user, "findFirst", async () => phoneAccount({ setupFailedAttempts: 20 }));
  const update = stub(t, prisma.user, "update", async () => ({}));
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await postHandler(authRouter, "/login")(
    { body: { phone: "0244000000", password: "Str0ng!TestPassw0rd" } },
    res,
  );
  assert.equal(res.code, 401);
  // Treated exactly like a wrong-password attempt -- the counter still increments, it never
  // resets while locked.
  assert.equal(update.mock.callCount(), 1);
});

test("/refresh rejects an expired pending session and revokes the presented token", async (t) => {
  stub(t, prisma.refreshToken, "findUnique", async () => ({
    id: 10,
    userId: 4,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: 4,
      fullName: "Phone Admin",
      email: null,
      setupRequired: true,
      tempPasswordExpiresAt: new Date(Date.now() - 1_000),
      isActive: true,
      role: "DISTRICT_ADMIN",
      regionIds: [],
      districtIds: [],
    },
  }));
  const revoke = stub(
    t,
    prisma.refreshToken,
    "updateMany",
    async (args: { where: { id: number; revokedAt: null } }) => {
      assert.deepEqual(args.where, { id: 10, revokedAt: null });
      return { count: 1 };
    },
  );
  const res = response();
  await postHandler(authRouter, "/refresh")(
    { cookies: { gnat_refresh_token: "sometoken" }, get: () => "XMLHttpRequest" } as never,
    res,
  );
  assert.equal(res.code, 401);
  assert.equal(revoke.mock.callCount(), 1);
});

test("complete-setup succeeds, clears setupRequired, and rejects the shared temp password as the new one", async (t) => {
  stubCache(t);
  stub(t, prisma.user, "findUnique", async () => ({
    id: 4,
    passwordHash: testPasswordHash,
    isActive: true,
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  const update = stub(t, prisma.user, "update", async (args: { data: Record<string, unknown> }) => {
    assert.equal(args.data.setupRequired, false);
    assert.equal(args.data.tempPasswordExpiresAt, null);
    assert.equal(args.data.setupFailedAttempts, 0);
    return {};
  });
  stub(t, prisma.refreshToken, "updateMany", async () => ({ count: 1 }));
  stub(t, prisma.refreshToken, "create", async () => ({}));
  stub(t, prisma.auditLog, "create", async () => ({}));
  stub(t, prisma.user, "findUniqueOrThrow", async () => ({
    id: 4,
    fullName: "Phone Admin",
    email: null,
    setupRequired: false,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  }));
  const res = response();
  res.locals.user = {
    id: 4,
    fullName: "Phone Admin",
    email: null,
    setupRequired: true,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  };
  await postHandler(authRouter, "/complete-setup")(
    {
      body: { currentPassword: "Str0ng!TestPassw0rd", newPassword: "Str0ng!NewPassw0rd" },
      get: () => undefined,
    },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal(update.mock.callCount(), 1);
});

test("complete-setup rejects newPassword === currentPassword before ever touching the database", async (t) => {
  const res = response();
  res.locals.user = {
    id: 4,
    fullName: "Phone Admin",
    email: null,
    setupRequired: true,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  };
  await postHandler(authRouter, "/complete-setup")(
    { body: { currentPassword: "Str0ng!TestPassw0rd", newPassword: "Str0ng!TestPassw0rd" } },
    res,
  );
  assert.equal(res.code, 400);
  assert.match(
    (res.body as { errors: { message: string }[] }).errors[0]!.message,
    /same as your current/i,
  );
});

test("complete-setup rejects a fully set-up account", async (t) => {
  const res = response();
  res.locals.user = {
    id: 2,
    fullName: "Classic Admin",
    email: "admin@example.test",
    setupRequired: false,
    role: "SUPER_ADMIN",
    regionIds: [],
    districtIds: [],
  };
  await postHandler(authRouter, "/complete-setup")(
    { body: { currentPassword: "Str0ng!TestPassw0rd", newPassword: "Str0ng!NewPassw0rd" } },
    res,
  );
  assert.equal(res.code, 403);
});

test("set-email fills a missing email and returns no new access token", async (t) => {
  stubCache(t);
  stub(t, prisma.user, "findUnique", async () => ({
    id: 4,
    email: null,
    passwordHash: testPasswordHash,
    isActive: true,
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.user, "findFirst", async () => null);
  const update = stub(t, prisma.user, "update", async (args: { data: { email: string } }) => {
    assert.equal(args.data.email, "staff@example.test");
    return {};
  });
  const deleteTokens = stub(t, prisma.userPasswordResetToken, "deleteMany", async () =>
    assert.fail("must not touch reset tokens on a first-set"),
  );
  stub(t, prisma.auditLog, "create", async () => ({}));
  stub(t, prisma.user, "findUniqueOrThrow", async () => ({
    id: 4,
    fullName: "Phone Admin",
    email: "staff@example.test",
    setupRequired: false,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  }));
  const res = response();
  res.locals.user = {
    id: 4,
    fullName: "Phone Admin",
    email: null,
    setupRequired: false,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  };
  await postHandler(authRouter, "/set-email")(
    {
      body: {
        currentPassword: "Str0ng!TestPassw0rd",
        email: "staff@example.test",
        confirmEmail: "staff@example.test",
      },
      get: () => undefined,
    },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(deleteTokens.mock.callCount(), 0);
  assert.equal((res.body as { accessToken?: string }).accessToken, undefined);
});

test("set-email changes an already-set email and deletes outstanding password-reset tokens", async (t) => {
  stubCache(t);
  stub(t, prisma.user, "findUnique", async () => ({
    id: 4,
    email: "old@example.test",
    passwordHash: testPasswordHash,
    isActive: true,
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.user, "findFirst", async () => null);
  stub(t, prisma.user, "update", async () => ({}));
  const deleteTokens = stub(
    t,
    prisma.userPasswordResetToken,
    "deleteMany",
    async (args: { where: { userId: number; consumedAt: null } }) => {
      assert.deepEqual(args.where, { userId: 4, consumedAt: null });
      return { count: 1 };
    },
  );
  stub(t, prisma.auditLog, "create", async () => ({}));
  stub(t, prisma.user, "findUniqueOrThrow", async () => ({
    id: 4,
    fullName: "Phone Admin",
    email: "new@example.test",
    setupRequired: false,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  }));
  const res = response();
  res.locals.user = {
    id: 4,
    fullName: "Phone Admin",
    email: "old@example.test",
    setupRequired: false,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  };
  await postHandler(authRouter, "/set-email")(
    {
      body: {
        currentPassword: "Str0ng!TestPassw0rd",
        email: "new@example.test",
        confirmEmail: "new@example.test",
      },
      get: () => undefined,
    },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal(deleteTokens.mock.callCount(), 1);
});

test("set-email rejects a server-side email/confirmEmail mismatch", async (t) => {
  const res = response();
  res.locals.user = {
    id: 4,
    fullName: "Phone Admin",
    email: null,
    setupRequired: false,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  };
  await postHandler(authRouter, "/set-email")(
    {
      body: {
        currentPassword: "Str0ng!TestPassw0rd",
        email: "staff@example.test",
        confirmEmail: "typo@example.test",
      },
    },
    res,
  );
  assert.equal(res.code, 400);
});

test("set-email maps a duplicate email to a clean 409, not a 500", async (t) => {
  stub(t, prisma.user, "findUnique", async () => ({
    id: 4,
    email: null,
    passwordHash: testPasswordHash,
    isActive: true,
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.user, "findFirst", async () => ({ id: 99 }));
  const res = response();
  res.locals.user = {
    id: 4,
    fullName: "Phone Admin",
    email: null,
    setupRequired: false,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  };
  await postHandler(authRouter, "/set-email")(
    {
      body: {
        currentPassword: "Str0ng!TestPassw0rd",
        email: "taken@example.test",
        confirmEmail: "taken@example.test",
      },
    },
    res,
  );
  assert.equal(res.code, 409);
});
