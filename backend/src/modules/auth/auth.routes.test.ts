import assert from "node:assert/strict";
import test from "node:test";

import { stub, routeHandler } from "../../test/fixtures.js";
import { prisma } from "../../lib/prisma.js";
import { authRouter } from "./auth.routes.js";
import { hashPasswordResetToken } from "./auth.tokens.js";

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
