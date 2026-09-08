import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Redis } from "ioredis";
import { claimsRouter } from "./claims.routes.js";
import { memberPortalRouter } from "../member-portal/member-portal.routes.js";
import { prisma } from "../../lib/prisma.js";
import { claimsProvider } from "./mankrado.provider.js";
import { memberUploadDirectory } from "../files/file.storage.js";
import type { ClaimSubmissionInput } from "./claims.provider.js";

function stub(t: TestContext, target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key];
  const replacement = t.mock.fn(implementation);
  target[key] = replacement;
  t.after(() => { target[key] = original; });
  return replacement;
}
function postHandler(router: any, path: string) {
  return router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods.post).route.stack[0].handle;
}
function response(role: string) {
  return { code: 200, body: null as any, locals: {
    user: { id: 7, role, districtId: role === "DISTRICT_ADMIN" ? 9 : null, regionId: null },
    member: { id: 123, controllerId: "123456", fullName: "Test Member", status: "ACTIVE" },
  }, status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; } };
}
const payload = {
  memberId: 123, claimType: "HOSPITALIZATION", claimantType: "MEMBER", claimantIdType: "GHANA_CARD", claimantIdNumber: "TEST-ID",
  claimantContact: { fullName: "Test Member", primaryPhone: "0200000000", nationality: "Ghanaian" },
  claimDetails: { hospitalName: "Test Hospital", admissionDate: "2025-06-01", dischargeDate: "2025-06-12", reason: "Test hospitalization" },
  paymentMethod: "CHEQUE", paymentDetails: { payeeName: "Test Member" }, documentIds: [1],
};
async function fixture(t: TestContext, role: string, inaccessible = false) {
  // Prevent cache and notification I/O: these tests execute the actual route and delivery code
  // against in-memory persistence and a mocked external provider.
  stub(t, Redis.prototype, "connect", async () => undefined);
  stub(t, Redis.prototype, "get", async () => null);
  stub(t, Redis.prototype, "set", async () => "OK");
  stub(t, Redis.prototype, "eval", async () => 1);
  stub(t, prisma.benefitPlanVersion, "findFirst", async () => null);
  stub(t, prisma.auditLog, "create", async () => ({}));
  const member = { id: 123, controllerId: "123456", fullName: "Test Member", districtId: 9, district: { regionId: 2 }, spouse: null };
  stub(t, prisma.member, "findFirst", async ({ where }: any) => {
    assert.equal(where.id, 123);
    if (role === "DISTRICT_ADMIN") assert.equal(where.districtId, 9);
    else assert.equal(where.districtId, undefined);
    return inaccessible ? null : member;
  });
  stub(t, prisma.member, "findUnique", async ({ where, select }: any) => {
    assert.equal(where.id, 123);
    return select?.districtId ? null : member; // Skip notification recipients in this fixture.
  });
  const filename = `${randomUUID()}.pdf`;
  const absolute = path.join(memberUploadDirectory, filename);
  await writeFile(absolute, "%PDF-1.4 test");
  t.after(() => unlink(absolute));
  stub(t, prisma.storedFile, "findMany", async ({ where }: any) => {
    assert.equal(where.memberId, 123);
    if (role === "MEMBER") assert.equal(where.uploadedByMemberId, 123);
    return [{ id: 1, slotKey: "dischargeSummaryOrBill", originalName: "test.pdf", mimeType: "application/pdf", sizeBytes: 13, storagePath: `member-files/${filename}` }];
  });
  let row: any;
  let creates = 0;
  stub(t, prisma.externalClaimSubmission, "upsert", async ({ where, create }: any) => {
    if (!row) { row = { id: 10, deliveryState: "NOT_SENT", ...create }; creates++; }
    assert.equal(where.idempotencyKey, row.idempotencyKey);
    return { ...row };
  });
  stub(t, prisma.externalClaimSubmission, "findUniqueOrThrow", async () => ({ ...row, member }));
  stub(t, prisma.externalClaimSubmission, "updateMany", async ({ data }: any) => {
    if (row.deliveryState !== "NOT_SENT") return { count: 0 };
    Object.assign(row, data); return { count: 1 };
  });
  stub(t, prisma.externalClaimSubmission, "update", async ({ data }: any) => { Object.assign(row, data); return { ...row }; });
  t.mock.method(claimsProvider, "isConfigured", () => true);
  const remote = t.mock.method(claimsProvider, "createSubmission", async (input: ClaimSubmissionInput) => {
    assert.equal(input.member.controllerId, "123456");
    assert.equal(input.documents[0]?.field, "hospital_med");
    return { externalClaimId: "TEST-CLAIM", status: "SUBMITTED" as const };
  });
  const token = randomUUID();
  return { remote, creates: () => creates, request: { body: payload, get: (name: string) => name === "Idempotency-Key" ? token : undefined } };
}

for (const role of ["SUPER_ADMIN", "NATIONAL_ADMIN", "DISTRICT_ADMIN"]) {
  test(`${role} submits a scoped claim and repeating the request sends only once`, async (t) => {
    const f = await fixture(t, role);
    const first = response(role);
    await postHandler(claimsRouter, "/submissions")(f.request, first);
    assert.equal(first.code, 201);
    assert.equal(first.body.data.deliveryState, "ACCEPTED");
    const repeat = response(role);
    await postHandler(claimsRouter, "/submissions")(f.request, repeat);
    assert.equal(f.creates(), 1); assert.equal(f.remote.mock.callCount(), 1);
  });
}
test("district administrator cannot submit for an inaccessible member", async (t) => {
  const f = await fixture(t, "DISTRICT_ADMIN", true);
  const res = response("DISTRICT_ADMIN");
  await postHandler(claimsRouter, "/submissions")(f.request, res);
  assert.equal(res.code, 404); assert.equal(f.creates(), 0); assert.equal(f.remote.mock.callCount(), 0);
});
test("member submits only for their authenticated policy, awaits review, and repeated requests do not duplicate", async (t) => {
  const f = await fixture(t, "MEMBER");
  const req = { ...f.request, body: { ...payload, memberId: 999 } };
  const res = response("MEMBER");
  await postHandler(memberPortalRouter, "/claims")(req, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.data.memberId, 123);
  assert.equal(res.body.data.submittedByMemberId, 123);
  assert.equal(res.body.data.source, "MEMBER_PORTAL");
  assert.equal(res.body.data.status, "PENDING");
  assert.equal(res.body.data.deliveryState, "NOT_SENT");
  await postHandler(memberPortalRouter, "/claims")(req, response("MEMBER"));
  assert.equal(f.creates(), 1); assert.equal(f.remote.mock.callCount(), 0);
});
