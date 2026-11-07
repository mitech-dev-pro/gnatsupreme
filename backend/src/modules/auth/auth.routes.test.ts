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

test("login by phone succeeds for a fresh S0 account with the temp password", async (t) => {
  stub(t, prisma.user, "findFirst", async (args: { where: { phone: string; email: null } }) => {
    assert.equal(args.where.phone, "0244000000");
    assert.equal(args.where.email, null);
    return {
      id: 4,
      fullName: "Phone Admin",
      email: null,
      setupRequired: true,
      tempPasswordExpiresAt: new Date(Date.now() + 60_000),
      pendingEmailExpiresAt: null,
      passwordHash: testPasswordHash,
      isActive: true,
      role: "DISTRICT_ADMIN",
      regionIds: [],
      districtIds: [],
    };
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

test("login by phone is rejected the instant tempPasswordExpiresAt passes -- pins the expiry-instant bug", async (t) => {
  stub(t, prisma.user, "findFirst", async () => ({
    id: 4,
    fullName: "Phone Admin",
    email: null,
    setupRequired: true,
    // One second in the past -- this is the exact round-4 regression: a column that stored an
    // *issue* time instead of an expiry instant made every account read as already-expired.
    tempPasswordExpiresAt: new Date(Date.now() - 1_000),
    pendingEmailExpiresAt: null,
    passwordHash: testPasswordHash,
    isActive: true,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  }));
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await postHandler(authRouter, "/login")(
    { body: { phone: "0244000000", password: "Str0ng!TestPassw0rd" } },
    res,
  );
  assert.equal(res.code, 401);
});

test("login by phone fails once the account's email is confirmed -- phone never reopens", async (t) => {
  // email: null is part of the lookup's own where clause, so a confirmed account can never
  // match the phone-login query at all -- simulated here by the stub simply returning null,
  // the same outcome the real findFirst would produce.
  stub(t, prisma.user, "findFirst", async () => null);
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await postHandler(authRouter, "/login")(
    { body: { phone: "0244000000", password: "Str0ng!TestPassw0rd" } },
    res,
  );
  assert.equal(res.code, 401);
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
      pendingEmailExpiresAt: null,
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
  await postHandler(
    authRouter,
    "/refresh",
  )({ cookies: { gnat_refresh_token: "sometoken" }, get: () => "XMLHttpRequest" } as never, res);
  assert.equal(res.code, 401);
  assert.equal(revoke.mock.callCount(), 1);
});

test("complete-setup succeeds from a fresh S0 account (password and email both required)", async (t) => {
  stubCache(t);
  stub(t, prisma.user, "findUnique", async () => ({
    id: 4,
    passwordHash: testPasswordHash,
    isActive: true,
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.user, "updateMany", async () => ({ count: 0 }));
  stub(t, prisma.user, "findFirst", async () => null);
  stub(t, prisma.userEmailVerificationToken, "deleteMany", async () => ({ count: 0 }));
  stub(t, prisma.userEmailVerificationToken, "create", async () => ({}));
  // user.update is called twice here: once by issuePendingEmail (sets pendingEmail only) and
  // once by the handler's own write (sets passwordHash/setupRequired) -- record both calls'
  // arguments and assert on the specific one that matters, rather than asserting inside the
  // stub itself.
  const updateWrites: Record<string, unknown>[] = [];
  const update = stub(t, prisma.user, "update", async (args: { data: Record<string, unknown> }) => {
    updateWrites.push(args.data);
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
      body: {
        currentPassword: "Str0ng!TestPassw0rd",
        newPassword: "Str0ng!NewPassw0rd",
        email: "new-admin@example.test",
      },
      get: () => undefined,
    },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal(update.mock.callCount(), 2);
  const setupWrite = updateWrites.find((data) => "setupRequired" in data);
  assert.equal(setupWrite?.setupRequired, false);
  assert.equal(setupWrite?.tempPasswordExpiresAt, null);
});

test("complete-setup rejects a fully set-up (S2) account", async (t) => {
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
    { body: { currentPassword: "Str0ng!TestPassw0rd" } },
    res,
  );
  assert.equal(res.code, 403);
});

test("complete-setup on an already set-up but unconfirmed (S1) account requires email but not a new password", async (t) => {
  const res = response();
  res.locals.user = {
    id: 5,
    fullName: "Pending Email Admin",
    email: null,
    setupRequired: false,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  };
  await postHandler(authRouter, "/complete-setup")(
    { body: { currentPassword: "Str0ng!TestPassw0rd" } },
    res,
  );
  assert.equal(res.code, 400);
  assert.match((res.body as { message: string }).message, /email/i);
});

test("resend-verification-email rejects an account with no pending email", async (t) => {
  const res = response();
  res.locals.user = {
    id: 6,
    fullName: "Classic Admin",
    email: "admin@example.test",
    pendingEmail: null,
    setupRequired: false,
    role: "SUPER_ADMIN",
    regionIds: [],
    districtIds: [],
  };
  await postHandler(authRouter, "/resend-verification-email")({ body: {}, get: () => undefined }, res);
  assert.equal(res.code, 400);
  assert.match((res.body as { message: string }).message, /no pending email/i);
});

test("resend-verification-email reissues a token for the existing pendingEmail and revokes every refresh token", async (t) => {
  stubCache(t);
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.user, "updateMany", async () => ({ count: 0 }));
  stub(t, prisma.user, "findFirst", async () => null);
  const deleteMany = stub(t, prisma.userEmailVerificationToken, "deleteMany", async () => ({
    count: 1,
  }));
  const createToken = stub(t, prisma.userEmailVerificationToken, "create", async (args: { data: { email: string } }) => {
    assert.equal(args.data.email, "typo-admin@example.test");
    return {};
  });
  const updateUser = stub(t, prisma.user, "update", async (args: { data: Record<string, unknown> }) => {
    assert.equal(args.data.pendingEmail, "typo-admin@example.test");
    return {};
  });
  const revoke = stub(
    t,
    prisma.refreshToken,
    "updateMany",
    async (args: { where: Record<string, unknown> }) => {
      assert.deepEqual(args.where, { userId: 7, revokedAt: null });
      return { count: 2 };
    },
  );
  const createRefresh = stub(t, prisma.refreshToken, "create", async () => ({}));
  stub(t, prisma.auditLog, "create", async () => ({}));
  stub(t, prisma.user, "findUniqueOrThrow", async () => ({
    id: 7,
    fullName: "Pending Email Admin",
    email: null,
    pendingEmail: "typo-admin@example.test",
    setupRequired: false,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  }));

  const res = response();
  res.locals.user = {
    id: 7,
    fullName: "Pending Email Admin",
    email: null,
    pendingEmail: "typo-admin@example.test",
    setupRequired: false,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  };
  await postHandler(authRouter, "/resend-verification-email")({ body: {}, get: () => undefined }, res);

  assert.equal(res.code, 200);
  assert.equal(deleteMany.mock.callCount(), 1);
  assert.equal(createToken.mock.callCount(), 1);
  assert.equal(updateUser.mock.callCount(), 1);
  assert.equal(revoke.mock.callCount(), 1);
  assert.equal(createRefresh.mock.callCount(), 1);
  assert.equal((res.body as { user: { pendingEmail: string } }).user.pendingEmail, "typo-admin@example.test");
});

test("confirm-email rejects a token whose address no longer matches pendingEmail", async (t) => {
  const tokenHash = hashPasswordResetToken("d".repeat(64));
  stub(
    t,
    prisma.userEmailVerificationToken,
    "findUnique",
    async (args: { where: { tokenHash: string } }) => {
      assert.equal(args.where.tokenHash, tokenHash);
      return {
        id: 1,
        userId: 4,
        email: "old@example.test",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        // pendingEmail has since changed -- this old link must not confirm the new address.
        user: { id: 4, fullName: "Phone Admin", isActive: true, pendingEmail: "new@example.test" },
      };
    },
  );
  const res = response();
  await postHandler(
    authRouter,
    "/confirm-email",
  )({ body: { token: "d".repeat(64) } }, res);
  assert.equal(res.code, 401);
});

test("confirm-email succeeds when the token still matches pendingEmail", async (t) => {
  stubCache(t);
  const tokenHash = hashPasswordResetToken("e".repeat(64));
  stub(
    t,
    prisma.userEmailVerificationToken,
    "findUnique",
    async (args: { where: { tokenHash: string } }) => {
      assert.equal(args.where.tokenHash, tokenHash);
      return {
        id: 2,
        userId: 4,
        email: "confirmed@example.test",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: {
          id: 4,
          fullName: "Phone Admin",
          isActive: true,
          pendingEmail: "confirmed@example.test",
        },
      };
    },
  );
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.userEmailVerificationToken, "updateMany", async () => ({ count: 1 }));
  const update = stub(t, prisma.user, "update", async (args: { data: Record<string, unknown> }) => {
    assert.equal(args.data.email, "confirmed@example.test");
    assert.equal(args.data.pendingEmail, null);
    return {};
  });
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await postHandler(
    authRouter,
    "/confirm-email",
  )({ body: { token: "e".repeat(64) } }, res);
  assert.equal(res.code, 200);
  assert.equal(update.mock.callCount(), 1);
});
