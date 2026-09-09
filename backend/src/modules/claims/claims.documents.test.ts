import { stub } from "../../test/fixtures.js";
import type { Prisma } from "../../generated/prisma/client.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../lib/prisma.js";
import { memberUploadDirectory } from "../files/file.storage.js";
import { loadClaimDocuments } from "./claims.documents.js";

test("revalidates stored bytes and rejects missing, duplicate, unmapped, and foreign files", async (t) => {
  const name = `${randomUUID()}.pdf`;
  const absolute = path.join(memberUploadDirectory, name);
  await writeFile(absolute, "%PDF-1.4 test");
  t.after(() => unlink(absolute));
  const file = {
    id: 1,
    originalName: "test.pdf",
    mimeType: "application/pdf",
    sizeBytes: 13,
    storagePath: `member-files/${name}`,
    slotKey: "dischargeSummaryOrBill",
  };
  const lookup = stub(
    t,
    prisma.storedFile,
    "findMany",
    async (args: Prisma.StoredFileFindManyArgs & { where: Prisma.StoredFileWhereInput }) => {
      assert.equal(args.where.memberId, 123);
      assert.equal(args.where.uploadedByMemberId, 123);
      return [file];
    },
  );
  const result = await loadClaimDocuments("HOSPITALIZATION", [1], 123, 123);
  assert.equal(result[0]?.field, "hospital_med");
  assert.equal(new TextDecoder().decode(result[0]?.bytes), "%PDF-1.4 test");
  lookup.mock.mockImplementation(async () => [{ ...file, slotKey: "others" }]);
  await assert.rejects(loadClaimDocuments("HOSPITALIZATION", [1], 123), /not supported/);
  lookup.mock.mockImplementation(async () => [file, { ...file, id: 2 }]);
  await assert.rejects(loadClaimDocuments("HOSPITALIZATION", [1, 2], 123), /only one file/);
  lookup.mock.mockImplementation(async () => []);
  await assert.rejects(loadClaimDocuments("HOSPITALIZATION", [1], 123), /invalid or unavailable/);
  await assert.rejects(loadClaimDocuments("HOSPITALIZATION", [], 123), /required documents/);
  lookup.mock.mockImplementation(async () => [file]);
  await writeFile(absolute, Buffer.alloc(1_000_001));
  await assert.rejects(loadClaimDocuments("HOSPITALIZATION", [1], 123), /1 MB/);
  await writeFile(absolute, "not a pdf");
  await assert.rejects(loadClaimDocuments("HOSPITALIZATION", [1], 123), /does not match/);
});
