import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { Request, Response, Router } from "express";

/** Prisma proxy methods cannot use mock.method; restore each replacement after its test. */
export function stub<T extends object, K extends keyof T, A extends unknown[], R>(
  t: TestContext,
  target: T,
  key: K,
  implementation: (...args: A) => R,
) {
  const original = target[key];
  const replacement = t.mock.fn(implementation);
  Reflect.set(target, key, replacement);
  t.after(() => {
    Reflect.set(target, key, original);
  });
  return replacement;
}

type TestRequest = {
  params?: Record<string, string>;
  body?: unknown;
  get?: (name: string) => string | undefined;
};
type TestResponse = {
  locals: object;
  status: (code: number) => unknown;
  json: (body: unknown) => unknown;
};

export function routeHandler(router: Router, path: string, method?: string) {
  const layer = router.stack.find((item) => {
    if (item.route?.path !== path) return false;
    if (!method) return true;
    const methods: unknown = Reflect.get(item.route, "methods");
    return methods !== null && typeof methods === "object" && Reflect.get(methods, method) === true;
  });
  assert.ok(layer?.route?.stack[0]);
  const handle = layer.route.stack[0].handle;
  // The test adapter supplies only the HTTP members used by these handlers.
  return async (request: TestRequest, response: TestResponse) =>
    handle(request as Request, response as Response, (error) => {
      if (error) throw error;
    });
}

export function postHandler(router: Router, path: string) {
  return routeHandler(router, path, "post");
}

export function responseData(body: unknown): Record<string, unknown> {
  assert.ok(body && typeof body === "object" && "data" in body);
  assert.ok(body.data && typeof body.data === "object" && !Array.isArray(body.data));
  return body.data as Record<string, unknown>;
}
