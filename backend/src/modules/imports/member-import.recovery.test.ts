import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { PassThrough, Readable } from "node:stream";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { stub, routeHandler } from "../../test/fixtures.js";
import { AppError } from "../../middleware/error-handler.js";
import { claimMemberImport, RECOVERY_STATUSES } from "./member-import.recovery.js";
import { recoveryValues, RECOVERY_HEADERS, stageMemberImport } from "./member-import.service.js";
import { writeMemberRecoveryWorkbook } from "./member-import.export.js";
import { runMemberImportCommit } from "./member-import.commit.js";
import { memberImportRouter } from "./member-import.routes.js";
import { processMemberImportJob } from "./member-import.worker.js";
import { memberQueueDeadline } from "../../queues/import.queue.js";

const actor = {
  id: 1,
  role: "DISTRICT_ADMIN" as const,
  districtId: 9,
  regionId: null,
  email: "staff@example.test",
  fullName: "Staff",
};
const startedAt = new Date("2026-10-29T12:00:00.000Z");
function response() {
  return {
    locals: { user: actor },
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
function transaction(t: TestContext) {
  stub(t, prisma, "$transaction", async (callback: (client: typeof prisma) => Promise<unknown>) =>
    callback(prisma),
  );
  stub(t, prisma.auditLog, "create", async () => ({}));
}
async function file(t: TestContext, csv: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "member-import-test-"));
  const filename = path.join(directory, "members.csv");
  await writeFile(filename, csv);
  t.after(async () => {
    await unlink(filename).catch(() => undefined);
    await rmdir(directory);
  });
  return filename;
}

test("only one competing enrollment or retry can claim a job version", async (t) => {
  let claimed = false;
  stub(
    t,
    prisma.importJob,
    "updateMany",
    async (args: { where: object; data: { totalRows: number; processedRows: number } }) => {
      assert.deepEqual(args.where, { id: 42, status: "COMPLETED", updatedAt: startedAt });
      assert.equal(args.data.totalRows, 100);
      assert.equal(args.data.processedRows, 60);
      if (claimed) return { count: 0 };
      claimed = true;
      return { count: 1 };
    },
  );
  const job = { id: 42, status: "COMPLETED" as const, updatedAt: startedAt };
  const result = await Promise.allSettled([
    claimMemberImport(job, 100, 40),
    claimMemberImport(job, 100, 40),
  ]);
  assert.equal(result.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(result.filter((item) => item.status === "rejected").length, 1);
});

test("history uses scoped pagination, stable ordering and a fresh total", async (t) => {
  stub(
    t,
    prisma.importJob,
    "findMany",
    async (args: { where: object; skip: number; take: number; orderBy: object }) => {
      assert.deepEqual(args.where, { type: "MEMBER_BULK", uploadedById: 1, status: "FAILED" });
      assert.equal(args.skip, 10);
      assert.equal(args.take, 10);
      assert.deepEqual(args.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
      return [{ id: 42 }];
    },
  );
  stub(t, prisma.importJob, "count", async () => 11);
  const res = response();
  await routeHandler(
    memberImportRouter,
    "/members",
    "get",
  )({ query: { page: "2", limit: "10", status: "FAILED" } } as never, res);
  const body = res.body as { pagination: { total: number; totalPages: number } };
  assert.equal(body.pagination.total, 11);
  assert.equal(body.pagination.totalPages, 2);
});

test("correction downloads enforce job ownership before returning any workbook", async (t) => {
  stub(t, prisma.importJob, "findFirst", async (args: { where: object }) => {
    assert.deepEqual(args.where, { id: 42, type: "MEMBER_BULK", uploadedById: 1 });
    return null;
  });
  const res = response();
  await routeHandler(
    memberImportRouter,
    "/members/:id/recovery-file",
    "get",
  )({ params: { id: "42" } }, res);
  assert.equal(res.code, 404);
});

test("correction workbooks preserve strings and cannot execute source formulas", async (t) => {
  let calls = 0;
  stub(
    t,
    prisma.memberBulkImportRow,
    "findMany",
    async (args: { where: { status: { in: string[] }; rowNumber: object }; take: number }) => {
      assert.deepEqual(args.where.status.in, [...RECOVERY_STATUSES]);
      assert.equal(args.take, 1000);
      return ++calls === 1
        ? [
            {
              rowNumber: 4,
              status: "INVALID",
              employmentCategory: "NON_TEACHING",
              region: { name: "Test Region" },
              rawData: {
                "Controller ID": "001234",
                "Full Name": "=1+1",
                Phone: "0244000000",
                "Place of Work": "Test Office",
                Gender: "Female",
              },
              issues: ["School is required"],
            },
          ]
        : [];
    },
  );
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const headers = new Map();
  Reflect.set(stream, "setHeader", (key: string, value: string) => headers.set(key, value));
  await writeMemberRecoveryWorkbook(42, stream as unknown as Response);
  const book = new ExcelJS.Workbook();
  await book.xlsx.read(Readable.from(chunks));
  const sheet = book.worksheets[0]!;
  assert.equal(sheet.getRow(2).getCell(1).value, "001234");
  assert.equal(sheet.getRow(2).getCell(2).type, ExcelJS.ValueType.String);
  assert.equal(sheet.getRow(2).getCell(2).value, "=1+1");
  assert.equal(sheet.getRow(2).getCell(5).value, "0244000000");
  assert.equal(sheet.getRow(2).getCell(8).value, "Test Region");
  assert.equal(sheet.rowCount, 2);
  assert.equal(headers.get("Cache-Control"), "no-store");
  assert.equal(RECOVERY_HEADERS.length, sheet.getRow(1).cellCount);
});

test("recovery values retain split names, staff category, region and invalid source fields", () => {
  const values = recoveryValues(
    { Firstname: "Ama", Surname: "Test", "Ghana Card ID": "incomplete" },
    "NON_TEACHING",
    "Test Region",
  );
  assert.equal(values[1], "Ama Test");
  assert.equal(values[3], "incomplete");
  assert.equal(values[7], "Test Region");
  assert.equal(values[15], "NON_TEACHING");
});

test("duplicate uploads keep existing history and hide another uploader's identifiers", async (t) => {
  const filename = await file(t, "Controller ID,Full Name\nTEST1234,Test Member");
  stub(t, prisma.importJob, "findUnique", async () => ({
    id: 77,
    uploadedById: 2,
    status: "COMPLETED",
    importedRows: 0,
    fileId: 99,
    file: { storagePath: "private-source.csv" },
  }));
  stub(t, prisma.importJob, "delete", async () => assert.fail("must retain import history"));
  const handle = memberImportRouter.stack
    .find((entry) => entry.route?.path === "/members" && Reflect.get(entry.route, "methods").post)!
    .route!.stack.at(-1)!.handle;
  const res = response();
  await handle(
    {
      file: { path: filename, mimetype: "text/csv" },
      body: { employmentCategory: "TEACHING" },
    } as unknown as Request,
    res as unknown as Response,
    () => {},
  );
  assert.equal(res.code, 409);
  assert.equal((res.body as { duplicateImport?: unknown }).duplicateImport, undefined);
  assert.equal(JSON.stringify(res.body).includes("private-source"), false);
});

test("a row already claimed or imported is never created or relabelled by a resumed runner", async (t) => {
  transaction(t);
  stub(t, prisma.memberBulkImportRow, "findMany", async () => [
    { id: 7, employmentCategory: "NON_TEACHING", rawData: {}, status: "READY" },
  ]);
  stub(t, prisma.memberBulkImportRow, "count", async () => 3);
  stub(t, prisma.importJob, "findFirst", async () => ({ id: 42 }));
  stub(t, prisma.memberBulkImportRow, "updateMany", async () => ({ count: 0 }));
  stub(t, prisma.member, "create", async () =>
    assert.fail("must not create an already claimed member"),
  );
  stub(t, prisma.memberBulkImportRow, "groupBy", async () => [
    { status: "IMPORTED", _count: { _all: 1 } },
    { status: "EXISTING", _count: { _all: 1 } },
    { status: "INVALID", _count: { _all: 1 } },
  ]);
  const writes = stub(
    t,
    prisma.importJob,
    "updateMany",
    async (args: { where: { startedAt: Date }; data: Record<string, unknown> }) => {
      assert.equal(args.where.startedAt, startedAt);
      assert.equal(args.data.totalRows, 3);
      assert.equal(args.data.importedRows, 1);
      assert.equal(args.data.unmatchedRows, 1);
      assert.equal(args.data.invalidRows, 1);
      return { count: 1 };
    },
  );
  await runMemberImportCommit(42, actor, {} as Request, startedAt);
  assert.equal(writes.mock.callCount(), 1);
});

test("an obsolete enrollment attempt stops and cannot overwrite the newer attempt", async (t) => {
  transaction(t);
  stub(t, prisma.memberBulkImportRow, "findMany", async () => [{ id: 7 }]);
  stub(t, prisma.memberBulkImportRow, "count", async () => 1);
  stub(t, prisma.importJob, "findFirst", async () => null);
  stub(t, prisma.importJob, "updateMany", async () =>
    assert.fail("obsolete attempt must not publish progress"),
  );
  await runMemberImportCommit(42, actor, {} as Request, startedAt);
});

test("validation identifies a minor's missing trustee before enrollment", async (t) => {
  transaction(t);
  const filename = await file(
    t,
    "Controller ID,Full Name,Gender,School,District,Beneficiary Name,Beneficiary Relationship,Beneficiary Date of Birth,Trustee Name\nTEST1234,Test Member,Female,Test School,Test District,Test Child,CHILD,2020-01-01,",
  );
  stub(t, prisma.importJob, "findUniqueOrThrow", async () => ({
    defaultEmploymentCategory: "TEACHING",
    defaultRegionId: null,
  }));
  stub(t, prisma.importJob, "updateMany", async () => ({ count: 1 }));
  stub(t, prisma.district, "findMany", async () => [
    { id: 9, name: "Test District", regionId: 3, region: { name: "Test Region" } },
  ]);
  stub(t, prisma.districtAlias, "findMany", async () => []);
  stub(t, prisma.member, "findMany", async () => []);
  stub(t, prisma.report20Row, "findMany", async () => []);
  const rows = stub(
    t,
    prisma.memberBulkImportRow,
    "createMany",
    async (args: { data: Array<{ status: string; issues: string[] }> }) => {
      assert.equal(args.data[0]!.status, "INVALID");
      assert.ok(args.data[0]!.issues.some((issue) => /trustee/i.test(issue)));
      return { count: 1 };
    },
  );
  await stageMemberImport(42, filename, "text/csv", actor, startedAt);
  assert.equal(rows.mock.callCount(), 1);
});

test("validation cannot publish rows after a newer retry claims the job", async (t) => {
  const filename = await file(
    t,
    "Controller ID,Full Name,School,District\nTEST1234,Test Member,School,District",
  );
  stub(t, prisma.importJob, "findUniqueOrThrow", async () => ({
    defaultEmploymentCategory: "TEACHING",
    defaultRegionId: null,
  }));
  stub(t, prisma.importJob, "updateMany", async () => ({ count: 0 }));
  await assert.rejects(
    stageMemberImport(42, filename, "text/csv", actor, startedAt),
    (error: unknown) => error instanceof AppError && error.statusCode === 409,
  );
});

test("queue timeouts return promptly and late failed or obsolete messages cannot stage members", async (t) => {
  await assert.rejects(memberQueueDeadline(new Promise(() => {}), 2), /did not confirm/);
  let failed = true;
  stub(t, prisma.importJob, "findUnique", async () => ({
    status: failed ? "FAILED" : "PROCESSING",
    startedAt: new Date(startedAt.getTime() + 1),
  }));
  stub(t, prisma.importJob, "findUniqueOrThrow", async () =>
    assert.fail("late attempt must not start validation"),
  );
  const data = {
    importJobId: 42,
    attemptStartedAt: startedAt.toISOString(),
    actorUser: actor,
    filePath: "not-used.csv",
    mimeType: "text/csv",
    originalName: "not-used.csv",
    auditContext: {},
  };
  await processMemberImportJob(data);
  failed = false;
  await processMemberImportJob(data);
});

test("enrollment interruptions persist an actionable failure for only the owning attempt", async (t) => {
  stub(t, prisma.memberBulkImportRow, "findMany", async () => {
    throw new Error("temporary database failure");
  });
  const write = stub(
    t,
    prisma.importJob,
    "updateMany",
    async (args: { where: object; data: { status: string; errorMessage: string } }) => {
      assert.deepEqual(args.where, { id: 42, status: "PROCESSING", startedAt });
      assert.equal(args.data.status, "FAILED");
      assert.match(args.data.errorMessage, /resume unfinished rows/);
      return { count: 1 };
    },
  );
  await runMemberImportCommit(42, actor, {} as Request, startedAt);
  assert.equal(write.mock.callCount(), 1);
});

test("resuming enrollment creates only ready rows and recomputes absolute totals", async (t) => {
  transaction(t);
  stub(t, prisma.memberBulkImportRow, "findMany", async () => [
    {
      id: 7,
      controllerId: "TEST1234",
      fullName: "New Member",
      school: "Head Office",
      employmentCategory: "NON_TEACHING",
      ghanaCardId: null,
      phone: null,
      districtId: null,
      regionId: 3,
      rowNumber: 3,
      rawData: { Gender: "Male", "Place of Work": "Test Office" },
    },
  ]);
  stub(t, prisma.memberBulkImportRow, "count", async () => 4);
  stub(t, prisma.importJob, "findFirst", async () => ({ id: 42 }));
  stub(t, prisma.memberBulkImportRow, "updateMany", async () => ({ count: 1 }));
  const created = stub(t, prisma.member, "create", async () => ({
    id: 70,
    ghanaCardId: null,
    spouse: null,
    districtId: null,
  }));
  stub(t, prisma.memberBulkImportRow, "update", async () => ({}));
  stub(t, prisma.memberBulkImportRow, "groupBy", async () => [
    { status: "IMPORTED", _count: { _all: 2 } },
    { status: "EXISTING", _count: { _all: 1 } },
    { status: "FAILED", _count: { _all: 1 } },
  ]);
  stub(t, prisma.importJob, "updateMany", async (args: { data: Record<string, unknown> }) => {
    assert.equal(args.data.totalRows, 4);
    assert.equal(args.data.importedRows, 2);
    assert.equal(args.data.invalidRows, 1);
    assert.equal(args.data.unmatchedRows, 1);
    assert.equal(args.data.readyRows, 0);
    return { count: 1 };
  });
  await runMemberImportCommit(42, actor, {} as Request, startedAt);
  assert.equal(created.mock.callCount(), 1);
});
