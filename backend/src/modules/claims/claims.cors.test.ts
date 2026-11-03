import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { app } from "../../app.js";
import { env } from "../../config/env.js";
import { claimsProvider } from "./mankrado.provider.js";

for (const endpoint of ["/api/claims/submissions", "/api/member-portal/claims"]) {
  test(`${endpoint} preflight allows idempotency only for the configured origin`, async (t) => {
    const submit = t.mock.method(claimsProvider, "createSubmission", async () => {
      assert.fail("Preflight must never submit a claim");
    });
    const server = app.listen(0, "127.0.0.1");
    t.after(
      () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        }),
    );
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}${endpoint}`;
    const preflight = (origin: string) =>
      fetch(url, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type,authorization,idempotency-key",
        },
      });

    const allowed = await preflight(env.FRONTEND_ORIGIN);
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get("access-control-allow-origin"), env.FRONTEND_ORIGIN);
    assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
    const headers = allowed.headers
      .get("access-control-allow-headers")
      ?.toLowerCase()
      .split(/\s*,\s*/);
    for (const header of ["content-type", "authorization", "idempotency-key"]) {
      assert.ok(headers?.includes(header), `Missing allowed header: ${header}`);
    }
    assert.ok(allowed.headers.get("access-control-allow-methods")?.split(",").includes("POST"));

    const denied = await preflight("https://unapproved-origin.invalid");
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    assert.equal(denied.headers.get("access-control-allow-credentials"), null);
    await denied.arrayBuffer();
    assert.equal(submit.mock.callCount(), 0);
  });
}
