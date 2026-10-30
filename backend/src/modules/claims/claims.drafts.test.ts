import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../../lib/prisma.js";
import { routeHandler, stub } from "../../test/fixtures.js";
import {
  createClaimDraftRouter,
  commitClaimDraft,
  draftOwnership,
  draftPayloadSchema,
} from "./claims.drafts.js";
import { claimsProvider } from "./mankrado.provider.js";
import { fileRouter } from "../files/file.routes.js";

const staff = {
  id: 1,
  role: "DISTRICT_ADMIN" as const,
  districtId: 9,
  regionId: null,
  fullName: "Staff",
  email: "staff@example.test",
};
const member = { id: 7, controllerId: "TEST7", fullName: "Member", status: "ACTIVE" as const };
const payload = {
  claimType: "" as const,
  claimantType: "MEMBER" as const,
  claimantIdNumber: "GHA-",
  contact: {
    fullName: "",
    nationality: "Ghanaian",
    email: "unfinished",
    gpsAddress: "",
    residentialAddress: "",
  },
  details: {
    subjectName: "",
    relationship: "",
    dateOfEvent: "",
    cause: "",
    diagnosisDate: "",
    diagnosingHospital: "",
    diagnosingPhysician: "",
    illness: "",
    illnessOther: "",
    hospitalName: "Partial Hospital",
    admissionDate: "",
    dischargeDate: "",
    reason: "",
  },
  paymentDetails: {},
  notes: "unfinished",
  page: 0,
};
const saved = {
  id: 4,
  memberId: 7,
  preparedByMemberId: 7,
  preparedById: null,
  payload,
  documentIds: [3],
  revision: 1,
  submissionKey: "00000000-0000-4000-8000-000000000007",
  submittedClaimId: null,
};
function response(audience: "member" | "staff" = "member") {
  return {
    locals: audience === "member" ? { member } : { user: staff },
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
const router = createClaimDraftRouter("member");

test("draft payloads accept incomplete input but strip declarations and insurer fields", () => {
  const result = draftPayloadSchema.parse({
    ...payload,
    declaration: true,
    externalStatus: "Paid",
    amountPayable: "50000",
  });
  assert.equal(result.claimantIdNumber, "GHA-");
  assert.equal("declaration" in result, false);
  assert.equal("externalStatus" in result, false);
});
test("draft queries require preparer ownership and current member scope", () => {
  assert.deepEqual(draftOwnership({ user: staff }), { preparedById: 1, member: { districtId: 9 } });
  assert.deepEqual(draftOwnership({ member }), { preparedByMemberId: 7, memberId: 7 });
});
test("members cannot save a draft for someone else", async (t) => {
  const lookup = stub(t, prisma.member, "findFirst", async () =>
    assert.fail("foreign policy must not be queried"),
  );
  await assert.rejects(
    routeHandler(
      router,
      "/",
      "post",
    )({ body: { memberId: 8, payload, documentIds: [] } }, response()),
    { statusCode: 404 },
  );
  assert.equal(lookup.mock.callCount(), 0);
});
test("draft save retains partial data and owned attachments without calling the insurer", async (t) => {
  stub(t, prisma.member, "findFirst", async () => member);
  stub(
    t,
    prisma.storedFile,
    "findMany",
    async (args: { where: { memberId: { in: number[] }; uploadedByMemberId: number } }) => {
      assert.deepEqual(args.where.memberId.in, [7]);
      assert.equal(args.where.uploadedByMemberId, 7);
      return [
        { id: 3, memberId: 7, slotKey: "dischargeSummaryOrBill", originalName: "report.pdf" },
      ];
    },
  );
  const create = stub(
    t,
    prisma.claimDraft,
    "create",
    async (args: { data: Record<string, unknown> }) => {
      assert.equal("declaration" in (args.data.payload as object), false);
      return saved;
    },
  );
  stub(t, prisma.auditLog, "create", async () => ({}));
  const send = stub(t, claimsProvider, "createSubmission", async () =>
    assert.fail("drafts cannot reach insurer"),
  );
  const res = response();
  await routeHandler(
    router,
    "/",
    "post",
  )({ body: { memberId: 7, payload: { ...payload, declaration: true }, documentIds: [3] } }, res);
  assert.equal(res.code, 201);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(send.mock.callCount(), 0);
});
test("draft saves reject attachment IDs outside the member/uploader scope", async (t) => {
  stub(t, prisma.member, "findFirst", async () => member);
  stub(t, prisma.storedFile, "findMany", async () => []);
  const create = stub(t, prisma.claimDraft, "create", async () =>
    assert.fail("must not save invalid attachments"),
  );
  await assert.rejects(
    routeHandler(
      router,
      "/",
      "post",
    )({ body: { memberId: 7, payload, documentIds: [88] } }, response()),
    { statusCode: 400 },
  );
  assert.equal(create.mock.callCount(), 0);
});
test("draft reads and deletes hide records belonging to another preparer", async (t) => {
  stub(t, prisma.claimDraft, "findFirst", async (args: { where: object }) => {
    assert.deepEqual(args.where, { id: 4, preparedByMemberId: 7, memberId: 7 });
    return null;
  });
  await assert.rejects(routeHandler(router, "/:id", "get")({ params: { id: "4" } }, response()), {
    statusCode: 404,
  });
  await assert.rejects(
    routeHandler(
      router,
      "/:id",
      "delete",
    )({ params: { id: "4" }, query: { revision: "1" } } as never, response()),
    { statusCode: 404 },
  );
});
test("a stale save cannot overwrite a later revision", async (t) => {
  stub(t, prisma.member, "findFirst", async () => member);
  stub(t, prisma.storedFile, "findMany", async () => []);
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.claimDraft, "findFirst", async () => ({ ...saved, revision: 2 }));
  stub(t, prisma.claimDraft, "updateMany", async (args: { where: { revision: number } }) => {
    assert.equal(args.where.revision, 1);
    return { count: 0 };
  });
  await assert.rejects(
    routeHandler(
      router,
      "/:id",
      "put",
    )(
      { params: { id: "4" }, body: { memberId: 7, revision: 1, payload, documentIds: [] } },
      response(),
    ),
    { statusCode: 409 },
  );
});
test("a draft is consumed in the same transaction as a single claim creation", async (t) => {
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.claimDraft, "findFirst", async () => saved);
  stub(t, prisma.claimDraft, "updateMany", async () => ({ count: 1 }));
  stub(t, prisma.externalClaimSubmission, "findUnique", async () => ({ memberId: 7 }));
  const mark = stub(
    t,
    prisma.claimDraft,
    "update",
    async (args: { data: { submittedClaimId: number } }) => {
      assert.equal(args.data.submittedClaimId, 55);
      return saved;
    },
  );
  const result = await commitClaimDraft(
    { draftId: 4, draftRevision: 1 },
    { member },
    7,
    async (_tx, key) => {
      assert.equal(key, `member-portal:7:${saved.submissionKey}`);
      return { id: 55 };
    },
  );
  assert.equal(result.id, 55);
  assert.equal(mark.mock.callCount(), 1);
});
test("stale or concurrent submission cannot consume a draft twice", async (t) => {
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.claimDraft, "findFirst", async () => saved);
  let locked = false;
  stub(t, prisma.claimDraft, "updateMany", async () => {
    if (locked) return { count: 0 };
    locked = true;
    return { count: 1 };
  });
  stub(t, prisma.externalClaimSubmission, "findUnique", async () => ({ memberId: 7 }));
  stub(t, prisma.claimDraft, "update", async () => saved);
  let creates = 0;
  const save = async () => {
    creates++;
    return { id: 55 };
  };
  const results = await Promise.allSettled([
    commitClaimDraft({ draftId: 4, draftRevision: 1 }, { member }, 7, save),
    commitClaimDraft({ draftId: 4, draftRevision: 1 }, { member }, 7, save),
  ]);
  assert.equal(creates, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});
test("retrying a consumed draft resolves its existing claim without changing it", async (t) => {
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.claimDraft, "findFirst", async () => ({
    ...saved,
    revision: 2,
    submittedClaimId: 55,
  }));
  const lock = stub(t, prisma.claimDraft, "updateMany", async () =>
    assert.fail("already submitted"),
  );
  const claim = await commitClaimDraft(
    { draftId: 4, draftRevision: 1 },
    { member },
    7,
    async () => ({ id: 55 }),
  );
  assert.equal(claim.id, 55);
  assert.equal(lock.mock.callCount(), 0);
});
test("a failed claim write leaves the draft unconsumed", async (t) => {
  stub(t, prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.claimDraft, "findFirst", async () => saved);
  stub(t, prisma.claimDraft, "updateMany", async () => ({ count: 1 }));
  const mark = stub(t, prisma.claimDraft, "update", async () => assert.fail("must not consume"));
  await assert.rejects(
    commitClaimDraft({ draftId: 4, draftRevision: 1 }, { member }, 7, async () => {
      throw Error("write failed");
    }),
    /write failed/,
  );
  assert.equal(mark.mock.callCount(), 0);
});
test("deleting a draft checks its revision and does not delete stored attachments", async (t) => {
  stub(t, prisma.claimDraft, "findFirst", async () => saved);
  stub(
    t,
    prisma.claimDraft,
    "deleteMany",
    async (args: { where: { revision: number; submittedClaimId: null } }) => {
      assert.equal(args.where.revision, 1);
      assert.equal(args.where.submittedClaimId, null);
      return { count: 1 };
    },
  );
  stub(t, prisma.auditLog, "create", async () => ({}));
  const files = stub(t, prisma.storedFile, "delete", async () =>
    assert.fail("shared attachments must remain"),
  );
  const res = response();
  await routeHandler(
    router,
    "/:id",
    "delete",
  )({ params: { id: "4" }, query: { revision: "1" } } as never, res);
  assert.equal(res.code, 200);
  assert.equal(files.mock.callCount(), 0);
});
test("staff cannot physically delete an attachment referenced by a saved draft", async (t) => {
  stub(t, prisma.storedFile, "findUnique", async () => ({
    id: 3,
    category: "CLAIM_DOCUMENT",
    uploadedById: 1,
    member: { districtId: 9, district: { regionId: 3 } },
    importJob: null,
  }));
  stub(t, prisma.externalClaimSubmission, "findFirst", async () => null);
  stub(t, prisma.claimDraft, "findFirst", async () => ({ id: 4 }));
  const remove = stub(t, prisma.storedFile, "delete", async () =>
    assert.fail("must retain saved attachment"),
  );
  const res = response("staff");
  await routeHandler(fileRouter, "/:id", "delete")({ params: { id: "3" } }, res);
  assert.equal(res.code, 409);
  assert.equal(remove.mock.callCount(), 0);
});

test("draft lists exclude consumed records and retain the preparer scope", async (t) => {
  stub(t, prisma.claimDraft, "findMany", async (args: { where: object }) => {
    assert.deepEqual(args.where, { preparedByMemberId: 7, memberId: 7, submittedClaimId: null });
    return [{ ...saved, member }];
  });
  stub(t, prisma.claimDraft, "count", async () => 1);
  stub(t, prisma.storedFile, "findMany", async () => [
    { id: 3, memberId: 7, originalName: "report.pdf", slotKey: "dischargeSummaryOrBill" },
  ]);
  const res = response();
  await routeHandler(router, "/", "get")({ query: { page: "1", limit: "10" } } as never, res);
  const body = res.body as {
    data: { submissionKey?: string; documents: unknown[] }[];
    pagination: { total: number };
  };
  assert.equal(body.pagination.total, 1);
  assert.equal(body.data[0]?.submissionKey, undefined);
  assert.equal(body.data[0]?.documents.length, 1);
});

test("draft attachment references do not block authorized staff downloads", async (t) => {
  stub(t, prisma.storedFile, "findUnique", async () => ({
    id: 3,
    category: "CLAIM_DOCUMENT",
    member: { districtId: 9, district: { regionId: 3 } },
    originalName: "report.pdf",
    mimeType: "application/pdf",
    storagePath: "member-files/00000000-0000-4000-8000-000000000003.pdf",
  }));
  const draftQuery = stub(t, prisma.claimDraft, "findFirst", async () =>
    assert.fail("draft references must not block reading"),
  );
  let downloaded = false;
  const res = {
    ...response("staff"),
    type() {
      return this;
    },
    download() {
      downloaded = true;
      return this;
    },
  };
  await routeHandler(
    fileRouter,
    "/:storedName",
    "get",
  )({ params: { storedName: "00000000-0000-4000-8000-000000000003.pdf" } }, res);
  assert.equal(downloaded, true);
  assert.equal(draftQuery.mock.callCount(), 0);
});
