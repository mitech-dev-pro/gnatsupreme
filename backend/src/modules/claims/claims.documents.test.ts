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
  const file = { id: 1, originalName: "test.pdf", mimeType: "application/pdf", sizeBytes: 13, storagePath: `member-files/${name}`, slotKey: "dischargeSummaryOrBill" };
  const lookup = stub(t, prisma.storedFile, "findMany", async (args: any) => {
    assert.equal(args.where.memberId, 123); assert.equal(args.where.uploadedByMemberId, 123); return [file] as any;
  });
  const result = await loadClaimDocuments("HOSPITALIZATION", [1], 123, 123);
  assert.equal(result[0]?.field, "hospital_med");
  assert.equal(new TextDecoder().decode(result[0]?.bytes), "%PDF-1.4 test");
  lookup.mock.mockImplementation(async () => [{ ...file, slotKey: "others" }] as any);
  await assert.rejects(loadClaimDocuments("HOSPITALIZATION", [1], 123), /not supported/);
  lookup.mock.mockImplementation(async () => [file, { ...file, id: 2 }] as any);
  await assert.rejects(loadClaimDocuments("HOSPITALIZATION", [1, 2], 123), /only one file/);
  lookup.mock.mockImplementation(async () => []);
  await assert.rejects(loadClaimDocuments("HOSPITALIZATION", [1], 123), /invalid or unavailable/);
  await assert.rejects(loadClaimDocuments("HOSPITALIZATION", [], 123), /required documents/);
  lookup.mock.mockImplementation(async () => [file] as any);
  await writeFile(absolute, Buffer.alloc(1_000_001));
  await assert.rejects(loadClaimDocuments("HOSPITALIZATION", [1], 123), /1 MB/);
  await writeFile(absolute, "not a pdf");
  await assert.rejects(loadClaimDocuments("HOSPITALIZATION", [1], 123), /does not match/);
});

// Prisma delegates are proxies without ordinary method descriptors.
function stub(t: import("node:test").TestContext, target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key];
  const replacement = t.mock.fn(implementation);
  target[key] = replacement;
  t.after(() => { target[key] = original; });
  return replacement;
}
