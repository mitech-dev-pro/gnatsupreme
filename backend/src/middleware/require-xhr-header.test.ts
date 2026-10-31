import assert from "node:assert/strict";
import test from "node:test";

import { requireXhrHeader } from "./require-xhr-header.js";

function response() {
  return {
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

test("requireXhrHeader rejects a request with no X-Requested-With header", () => {
  const res = response();
  requireXhrHeader(
    { get: () => undefined } as unknown as import("express").Request,
    res as unknown as import("express").Response,
    () => assert.fail("must not pass"),
  );
  assert.equal(res.code, 403);
});

test("requireXhrHeader rejects a non-matching header value", () => {
  const res = response();
  requireXhrHeader(
    { get: () => "something-else" } as unknown as import("express").Request,
    res as unknown as import("express").Response,
    () => assert.fail("must not pass"),
  );
  assert.equal(res.code, 403);
});

test("requireXhrHeader passes through with the expected header", () => {
  const res = response();
  let called = false;
  requireXhrHeader(
    { get: () => "XMLHttpRequest" } as unknown as import("express").Request,
    res as unknown as import("express").Response,
    () => {
      called = true;
    },
  );
  assert.equal(called, true);
  assert.equal(res.code, 200);
});
