/**
 * clear-members-and-uploads.ts
 *
 * Wipes all Member records and all StoredFile ("uploads") records, plus
 * everything that Prisma's schema-level FK constraints require to be
 * cleared first. Users, Regions, Districts, OrganizationSettings, and
 * BenefitPlanVersions are left untouched.
 *
 * Deletion order (dictated by onDelete: Restrict constraints in the schema):
 *   1. ExternalClaimSubmission  — Restrict on memberId
 *   2. MemberTransfer           — Restrict on memberId
 *   3. ImportJob                — Restrict on fileId (cascades Report20Row,
 *                                  MemberBulkImportRow automatically)
 *   4. StoredFile               — the actual uploads (+ files on disk)
 *   5. Member                   — Spouse, Beneficiary, MemberWorkflowEvent,
 *                                  MemberChangeRequest, MemberSession,
 *                                  MemberPasswordResetToken, Notification
 *                                  cascade automatically (onDelete: Cascade)
 *
 * Usage:
 *   npm run clear:members-and-uploads               # dry run (counts only)
 *   npm run clear:members-and-uploads -- --yes       # run for real
 *   npm run clear:members-and-uploads -- --yes --keep-files  # skip disk cleanup
 *
 * On-disk files are removed from the same upload root the app itself uses
 * (env.UPLOAD_DIR, resolved against process.cwd() — see file.storage.ts).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { confirm } from "@inquirer/prompts";

import { env } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";

const CONFIRM_FLAG = process.argv.includes("--yes");
const KEEP_FILES = process.argv.includes("--keep-files");
const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);

async function deleteFilesFromDisk(storagePaths: string[]) {
  if (KEEP_FILES) {
    console.log("--keep-files set, skipping disk cleanup.");
    return;
  }

  let removed = 0;
  let missing = 0;
  for (const storagePath of storagePaths) {
    const fullPath = path.join(uploadRoot, storagePath);
    try {
      await fs.unlink(fullPath);
      removed++;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        missing++;
      } else {
        console.error(`Failed to remove ${fullPath}:`, err.message);
      }
    }
  }
  console.log(`Disk cleanup: removed ${removed} file(s), ${missing} were already missing.`);
}

async function main() {
  const [memberCount, fileCount, claimCount, transferCount, importJobCount] = await Promise.all([
    prisma.member.count(),
    prisma.storedFile.count(),
    prisma.externalClaimSubmission.count(),
    prisma.memberTransfer.count(),
    prisma.importJob.count(),
  ]);

  console.log("About to permanently delete:");
  console.log(`  ${memberCount} member(s)`);
  console.log(`  ${fileCount} stored file(s) (uploads)`);
  console.log(`  ${claimCount} external claim submission(s)`);
  console.log(`  ${transferCount} member transfer(s)`);
  console.log(`  ${importJobCount} import job(s) (and their Report20Row / MemberBulkImportRow children)`);
  console.log("Users, Regions, Districts, OrganizationSettings, BenefitPlanVersions are NOT touched.\n");

  if (memberCount === 0 && fileCount === 0) {
    console.log("Nothing to delete.");
    return;
  }

  if (!CONFIRM_FLAG) {
    const ok = await confirm({ message: "This cannot be undone. Continue?", default: false });
    if (!ok) {
      console.log("Aborted.");
      return;
    }
  }

  // Grab storage paths before we delete the rows, so we can clean up disk after.
  const filesToRemove = await prisma.storedFile.findMany({
    select: { storagePath: true },
  });

  await prisma.$transaction(
    [
      prisma.externalClaimSubmission.deleteMany({}),
      prisma.memberTransfer.deleteMany({}),
      prisma.importJob.deleteMany({}), // cascades Report20Row, MemberBulkImportRow
      prisma.storedFile.deleteMany({}),
      prisma.member.deleteMany({}), // cascades Spouse, Beneficiary, MemberWorkflowEvent,
      // MemberChangeRequest, MemberSession, MemberPasswordResetToken, Notification
    ],
    { timeout: 10 * 60_000 }, // large member counts cascade a lot of child-row deletes; the 5s default commit timeout isn't enough
  );

  console.log("Database rows deleted.");

  await deleteFilesFromDisk(filesToRemove.map((f) => f.storagePath));

  console.log("Done.");
}

try {
  await main();
} catch (error) {
  console.error("Failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
