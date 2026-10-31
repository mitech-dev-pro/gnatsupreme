import assert from "node:assert/strict";
import test from "node:test";

import { env } from "../config/env.js";
import { authenticateExternalApiKey } from "./authenticate-external-api-key.js";

function request(headers: Record<string, string> = {}) {
  return {
    header: (name: string) => headers[name.toLowerCase()],
    ip: "127.0.0.1",
    originalUrl: "/external/members/TEST",
  };
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

function withApiKey(t: { after: (fn: () => void) => void }, key: string | undefined) {
  const original = env.EXTERNAL_API_KEY;
  Reflect.set(env, "EXTERNAL_API_KEY", key);
  t.after(() => Reflect.set(env, "EXTERNAL_API_KEY", original));
}

test("a request with no x-api-key header is rejected", (t) => {
  withApiKey(t, "the-real-key");
  const res = response();
  let nextCalled = false;
  authenticateExternalApiKey(request() as never, res as never, () => {
    nextCalled = true;
  });
  assert.equal(res.code, 401);
  assert.equal(nextCalled, false);
});

test("a request with the wrong x-api-key is rejected", (t) => {
  withApiKey(t, "the-real-key");
  const res = response();
  authenticateExternalApiKey(
    request({ "x-api-key": "guessed-key" }) as never,
    res as never,
    () => undefined,
  );
  assert.equal(res.code, 401);
  assert.equal((res.body as { code: string }).code, "EXTERNAL_AUTH_REQUIRED");
});

test("a key of a different length than the real one is still rejected, not thrown on", (t) => {
  withApiKey(t, "the-real-key");
  const res = response();
  authenticateExternalApiKey(
    request({ "x-api-key": "short" }) as never,
    res as never,
    () => undefined,
  );
  assert.equal(res.code, 401);
});

test("the endpoint is unusable when no API key is configured at all", (t) => {
  withApiKey(t, undefined);
  const res = response();
  authenticateExternalApiKey(
    request({ "x-api-key": "anything" }) as never,
    res as never,
    () => undefined,
  );
  assert.equal(res.code, 401);
});

test("the correct x-api-key is accepted and identifies the external client", (t) => {
  withApiKey(t, "the-real-key");
  const res = response();
  let nextCalled = false;
  authenticateExternalApiKey(
    request({ "x-api-key": "the-real-key" }) as never,
    res as never,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
  assert.deepEqual(res.locals.externalClient, { keyId: "default" });
});
