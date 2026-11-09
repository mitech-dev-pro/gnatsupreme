import assert from "node:assert/strict";
import test from "node:test";
import { Redis } from "ioredis";

import { stub } from "../test/fixtures.js";
import { prisma } from "../lib/prisma.js";
import { authenticate, authenticateAllowPendingSetup } from "./authenticate.js";
import { createAccessToken } from "../modules/auth/auth.tokens.js";

// No real Redis in tests -- withCache falls back to calling the loader directly once the
// connection attempt fails, same rationale as every other test touching staff auth caching.
function stubCache(t: Parameters<typeof stub>[0]) {
  stub(t, Redis.prototype, "connect", async () => {
    throw new Error("no redis in tests");
  });
}

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
  };
}

function request(token: string) {
  return { header: () => `Bearer ${token}` } as unknown as import("express").Request;
}

test("a pending account (setupRequired) is gated off an ordinary route with a machine-readable code", async (t) => {
  stubCache(t);
  stub(t, prisma.user, "findFirst", async () => ({
    id: 1,
    fullName: "Pending Admin",
    email: null,
    setupRequired: true,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  }));
  const token = await createAccessToken(1);
  const res = response();
  let called = false;
  await authenticate(request(token), res as unknown as import("express").Response, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.code, 403);
  assert.equal((res.body as { code: string }).code, "SETUP_REQUIRED");
});

test("the same pending account passes through authenticateAllowPendingSetup", async (t) => {
  stubCache(t);
  stub(t, prisma.user, "findFirst", async () => ({
    id: 1,
    fullName: "Pending Admin",
    email: null,
    setupRequired: true,
    role: "DISTRICT_ADMIN",
    regionIds: [],
    districtIds: [],
  }));
  const token = await createAccessToken(1);
  const res = response();
  let called = false;
  await authenticateAllowPendingSetup(
    request(token),
    res as unknown as import("express").Response,
    () => {
      called = true;
    },
  );
  assert.equal(called, true);
  assert.equal((res.locals.user as { id: number }).id, 1);
  assert.equal((res.locals.user as { setupRequired: boolean }).setupRequired, true);
});

test("a fully set-up account passes through the ordinary authenticate gate", async (t) => {
  stubCache(t);
  stub(t, prisma.user, "findFirst", async () => ({
    id: 2,
    fullName: "Classic Admin",
    email: "admin@example.test",
    setupRequired: false,
    role: "SUPER_ADMIN",
    regionIds: [],
    districtIds: [],
  }));
  const token = await createAccessToken(2);
  const res = response();
  let called = false;
  await authenticate(request(token), res as unknown as import("express").Response, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal((res.locals.user as { id: number }).id, 2);
});

test("an unknown or inactive user is rejected before the setup check ever runs", async (t) => {
  stubCache(t);
  stub(t, prisma.user, "findFirst", async () => null);
  const token = await createAccessToken(999);
  const res = response();
  let called = false;
  await authenticate(request(token), res as unknown as import("express").Response, () => {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.code, 401);
});
