import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { routeHandler, stub } from "../../test/fixtures.js";
import { memberPortalRouter } from "../member-portal/member-portal.routes.js";
import { claimsProvider } from "./mankrado.provider.js";
import { uploadRoot } from "../files/file.storage.js";

function response() {
  return {
    locals: { member: { id: 7, controllerId: "123456" } },
    code: 200,
    body: null as unknown,
    headersSent: false,
    sentFile: "",
    status(code: number) {
      this.code = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader() {
      return this;
    },
    type() {
      return this;
    },
    attachment() {
      return this;
    },
    sendFile(file: string, done: (error?: Error) => void) {
      this.sentFile = file;
      done();
    },
  };
}

test("a member can read their saved claim and only its owned documents without calling Mankrado", async (t) => {
  stub(
    t,
    prisma.externalClaimSubmission,
    "findFirst",
    async (args: Prisma.ExternalClaimSubmissionFindFirstArgs) => {
      assert.deepEqual(args.where, { id: 1, memberId: 7 });
      assert.equal(args.select?.externalAssessment, true);
      assert.equal(args.select?.claimantName, true);
      return { id: 1, claimDetails: { hospitalName: "Saved Hospital" }, documentIds: [3] };
    },
  );
  stub(t, prisma.storedFile, "findMany", async (args: Prisma.StoredFileFindManyArgs) => {
    assert.deepEqual(args.where, { id: { in: [3] }, memberId: 7, category: "CLAIM_DOCUMENT" });
    return [{ id: 3, originalName: "report.pdf" }];
  });
  const external = t.mock.method(claimsProvider, "details", async () =>
    assert.fail("local claim must not wait for insurer"),
  );
  const res = response();
  await routeHandler(memberPortalRouter, "/claims/:id")({ params: { id: "1" } }, res);
  assert.equal(res.code, 200);
  assert.equal(
    (res.body as { data: { claimDetails: { hospitalName: string } } }).data.claimDetails
      .hospitalName,
    "Saved Hospital",
  );
  assert.equal(external.mock.callCount(), 0);
});

for (const route of [
  "/claims/:id",
  "/claims/:id/assessment",
  "/claims/:id/documents/:documentId",
]) {
  test(`member ownership is enforced before reading ${route}`, async (t) => {
    stub(
      t,
      prisma.externalClaimSubmission,
      "findFirst",
      async (args: Prisma.ExternalClaimSubmissionFindFirstArgs) => {
        assert.equal(args.where?.memberId, 7);
        return null;
      },
    );
    const file = stub(t, prisma.storedFile, "findFirst", async () =>
      assert.fail("must not read foreign documents"),
    );
    const external = t.mock.method(claimsProvider, "details", async () =>
      assert.fail("must not fetch foreign assessment"),
    );
    const res = response();
    await routeHandler(memberPortalRouter, route)({ params: { id: "1", documentId: "3" } }, res);
    assert.equal(res.code, 404);
    assert.equal(file.mock.callCount(), 0);
    assert.equal(external.mock.callCount(), 0);
  });
}

test("member assessment refresh stores only a matching insurer assessment", async (t) => {
  stub(t, prisma.externalClaimSubmission, "findFirst", async () => ({
    id: 1,
    externalClaimId: "42",
  }));
  t.mock.method(claimsProvider, "details", async (id: string | number) => {
    assert.equal(id, "42");
    return {
      id: "42",
      staffId: "123456",
      claimNumber: "MC-42",
      name: "Member",
      claimDate: null,
      amountPayable: "0.00",
      status: "Assessing",
      rejectReason: null,
    };
  });
  stub(
    t,
    prisma.externalClaimSubmission,
    "update",
    async (args: Prisma.ExternalClaimSubmissionUpdateArgs) => {
      assert.equal(args.data.externalStatus, "Assessing");
      assert.equal(args.data.claimDetails, undefined);
      assert.equal(args.data.status, undefined);
      assert.ok(args.data.lastSyncedAt instanceof Date);
      return {};
    },
  );
  const res = response();
  await routeHandler(memberPortalRouter, "/claims/:id/assessment")({ params: { id: "1" } }, res);
  assert.equal(res.code, 200);
  assert.equal((res.body as { data: { claimNumber: string } }).data.claimNumber, "MC-42");
});

test("member assessment outages preserve the saved claim", async (t) => {
  stub(t, prisma.externalClaimSubmission, "findFirst", async () => ({
    id: 1,
    externalClaimId: "42",
  }));
  t.mock.method(claimsProvider, "details", async () => {
    throw new Error("offline");
  });
  stub(t, prisma.externalClaimSubmission, "update", async () =>
    assert.fail("must preserve snapshot"),
  );
  const res = response();
  await routeHandler(memberPortalRouter, "/claims/:id/assessment")({ params: { id: "1" } }, res);
  assert.equal(res.code, 502);
});

test("a document not attached to the owned claim cannot be downloaded", async (t) => {
  stub(t, prisma.externalClaimSubmission, "findFirst", async () => ({ documentIds: [4] }));
  const file = stub(t, prisma.storedFile, "findFirst", async () =>
    assert.fail("must not read unattached file"),
  );
  const res = response();
  await routeHandler(memberPortalRouter, "/claims/:id/documents/:documentId")(
    { params: { id: "1", documentId: "3" } },
    res,
  );
  assert.equal(res.code, 404);
  assert.equal(file.mock.callCount(), 0);
});

for (const storagePath of ["claims/report.pdf", "../../outside.pdf"]) {
  test(`member document downloads enforce member, category and storage root (${storagePath})`, async (t) => {
    stub(t, prisma.externalClaimSubmission, "findFirst", async () => ({ documentIds: [3] }));
    stub(t, prisma.storedFile, "findFirst", async (args: Prisma.StoredFileFindFirstArgs) => {
      assert.deepEqual(args.where, { id: 3, memberId: 7, category: "CLAIM_DOCUMENT" });
      return { storagePath, originalName: "report.pdf", mimeType: "application/pdf" };
    });
    const res = response();
    await routeHandler(memberPortalRouter, "/claims/:id/documents/:documentId")(
      { params: { id: "1", documentId: "3" } },
      res,
    );
    assert.equal(res.code, storagePath.startsWith("..") ? 404 : 200);
    assert.equal(
      res.sentFile,
      storagePath.startsWith("..") ? "" : path.resolve(uploadRoot, storagePath),
    );
  });
}
