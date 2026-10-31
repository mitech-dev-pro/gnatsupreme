import assert from "node:assert/strict";
import test from "node:test";

import { stub, routeHandler } from "../../test/fixtures.js";
import { prisma } from "../../lib/prisma.js";
import { memberAuthRouter } from "./member-auth.routes.js";
import { hashMemberPassword } from "./member-auth.tokens.js";

function response() {
  return {
    locals: { member: { id: 7, controllerId: "123456" } },
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

test("change-password rejects an incorrect current password without touching the row", async (t) => {
  const currentHash = await hashMemberPassword("correct-current-password");
  stub(t, prisma.member, "findUnique", async () => ({
    id: 7,
    controllerId: "123456",
    passwordHash: currentHash,
  }));
  const update = stub(t, prisma.member, "update", async () =>
    assert.fail("must not update on a wrong current password"),
  );
  const res = response();
  await routeHandler(
    memberAuthRouter,
    "/change-password",
    "post",
  )(
    { body: { currentPassword: "wrong-password", password: "a-new-strong-password" } },
    res,
  );
  assert.equal(res.code, 401);
  assert.equal(update.mock.callCount(), 0);
});

test("change-password updates the hash and revokes every existing session", async (t) => {
  const currentHash = await hashMemberPassword("correct-current-password");
  stub(t, prisma.member, "findUnique", async () => ({
    id: 7,
    controllerId: "123456",
    passwordHash: currentHash,
  }));
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  const update = stub(t, prisma.member, "update", async (args: { where: { id: number } }) => {
    assert.equal(args.where.id, 7);
    return { id: 7 };
  });
  const revoke = stub(
    t,
    prisma.memberSession,
    "updateMany",
    async (args: { where: { memberId: number; revokedAt: null } }) => {
      assert.deepEqual(args.where, { memberId: 7, revokedAt: null });
      return { count: 2 };
    },
  );
  stub(t, prisma.auditLog, "create", async () => ({}));
  const res = response();
  await routeHandler(
    memberAuthRouter,
    "/change-password",
    "post",
  )(
    {
      body: { currentPassword: "correct-current-password", password: "a-new-strong-password" },
      get: () => undefined,
    },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(revoke.mock.callCount(), 1);
});
