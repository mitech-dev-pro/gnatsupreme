import assert from "node:assert/strict";
import test from "node:test";
import { claimsRouter } from "./claims.routes.js";
import { prisma } from "../../lib/prisma.js";
import { claimsProvider } from "./mankrado.provider.js";
import { authenticate } from "../../middleware/authenticate.js";

const user = { id: 1, role: "DISTRICT_ADMIN", districtId: 9, regionId: null };
function response() {
  return { locals: { user }, code: 200, body: null as any,
    status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; } };
}
function handler(path: string) {
  const layer = (claimsRouter as any).stack.find((layer: any) => layer.route?.path === path);
  assert.ok(layer);
  return layer.route.stack[0].handle as (request: any, response: any) => Promise<void>;
}
test("claims router requires authentication before endpoint handlers", async () => {
  assert.equal((claimsRouter as any).stack[0].handle, authenticate);
  const res = response();
  await authenticate({ header: () => undefined } as any, res as any, () => assert.fail("must not pass"));
  assert.equal(res.code, 401);
});
test("out-of-scope history cannot call Mankrado", async (t) => {
  stub(t, prisma.member, "findFirst", async (args: any) => {
    assert.equal(args.where.controllerId, "123456"); assert.equal(args.where.districtId, 9); return null;
  });
  const remote = t.mock.method(claimsProvider, "history", async () => []);
  const res = response(); await handler("/history/:staffId")({ params: { staffId: "123456" } }, res);
  assert.equal(res.code, 404); assert.equal(remote.mock.callCount(), 0);
});
test("external detail access requires a locally associated, scoped Mankrado claim", async (t) => {
  stub(t, prisma.externalClaimSubmission, "findFirst", async (args: any) => {
    assert.equal(args.where.externalClaimId, "MK-1"); assert.equal(args.where.provider, "MANKRADO");
    assert.equal(args.where.member.is.districtId, 9); return null;
  });
  const remote = t.mock.method(claimsProvider, "details", async () => ({ id: "MK-1", claimNumber: "MC-1", name: null, claimDate: null, amountPayable: null, rejectReason: null }));
  const res = response(); await handler("/claimdetails/:externalId")({ params: { externalId: "MK-1" } }, res);
  assert.equal(res.code, 404); assert.equal(remote.mock.callCount(), 0);
});
test("authorized history is returned but mismatched member data is rejected", async (t) => {
  stub(t, prisma.member, "findFirst", async () => ({ id: 1 }) as any);
  const remote = t.mock.method(claimsProvider, "history", async () => [{ id: "MK-1", staffId: "123456" }]);
  const res = response(); await handler("/history/:staffId")({ params: { staffId: "123456" } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.data[0].id, "MK-1");
  remote.mock.mockImplementation(async () => [{ id: "OTHER", staffId: "999999" }]);
  const other = response(); await handler("/history/:staffId")({ params: { staffId: "123456" } }, other);
  assert.equal(other.code, 502); assert.equal(other.body.data, undefined);
});
test("detail sync stores external status without changing local review status", async (t) => {
  stub(t, prisma.externalClaimSubmission, "findFirst", async () => ({ id: 1, member: { controllerId: "123456" } }) as any);
  t.mock.method(claimsProvider, "details", async () => ({ id: "MK-1", claimNumber: "MC-1", name: "Test Member", claimDate: null, amountPayable: "8095.64", rejectReason: null, staffId: "123456", status: "ASSESSING" }));
  stub(t, prisma.externalClaimSubmission, "update", async (args: any) => {
    assert.equal(args.data.externalStatus, "ASSESSING"); assert.equal(args.data.status, undefined); return {} as any;
  });
  const res = response(); await handler("/claimdetails/:externalId")({ params: { externalId: "MK-1" } }, res);
  assert.equal(res.code, 200);
});

test("saved-claim recovery is scoped and cannot retry previously attempted claims", async (t) => {
  stub(t, prisma.externalClaimSubmission, "findFirst", async (args: any) => {
    assert.equal(args.where.deliveryState, "NOT_SENT");
    assert.equal(args.where.provider, "MANKRADO");
    assert.equal(args.where.member.is.districtId, 9);
    assert.deepEqual(args.where.OR[1], { source: "MEMBER_PORTAL", reviewedAt: { not: null } });
    return null;
  });
  const remote = t.mock.method(claimsProvider, "createSubmission", async () => ({ externalClaimId: "MK-1", status: "SUBMITTED" as const }));
  const res = response(); await handler("/submissions/:id/send")({ params: { id: "1" } }, res);
  assert.equal(res.code, 409); assert.equal(remote.mock.callCount(), 0);
});

test("review return records the decision atomically without sending a claim", async (t) => {
  stub(t, prisma.externalClaimSubmission, "findFirst", async () => ({ id: 1, claimType: "DEATH", member: { fullName: "Test", districtId: 9 } }));
  stub(t, prisma.externalClaimSubmission, "updateMany", async (args: any) => {
    assert.equal(args.where.reviewedAt, null); assert.equal(args.where.deliveryState, "NOT_SENT");
    assert.equal(args.data.status, "RETURNED"); return { count: 1 };
  });
  stub(t, prisma.externalClaimSubmission, "findUniqueOrThrow", async () => ({ id: 1, status: "RETURNED" }));
  stub(t, prisma.auditLog, "create", async () => ({}));
  const remote = t.mock.method(claimsProvider, "createSubmission", async () => ({ externalClaimId: "MK-1", status: "SUBMITTED" as const }));
  const res = response(); await handler("/submissions/:id/review")({ params: { id: "1" }, body: { action: "RETURN", note: "Replace document" } }, res);
  assert.equal(res.code, 200); assert.equal(remote.mock.callCount(), 0);
});

// Prisma delegates are proxies without ordinary method descriptors.
function stub(t: import("node:test").TestContext, target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key];
  const replacement = t.mock.fn(implementation);
  target[key] = replacement;
  t.after(() => { target[key] = original; });
  return replacement;
}
