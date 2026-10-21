import { confirm, input } from "@inquirer/prompts";

import { prisma } from "../src/lib/prisma.js";
import { createAccessToken } from "../src/modules/auth/auth.tokens.js";

// Finds PENDING MEMBER_DETAILS change requests whose proposedData is phone-number-only (no
// other field proposed alongside it), and approves them through the real
// POST /api/change-requests/bulk/review endpoint -- the same validation, audit trail, and
// member notification staff get one at a time from the UI, just batched. A phone-only request
// never hits the endpoint's one conflict check (Ghana Card ID), so every one of these is safe
// to approve mechanically; name/school/Ghana Card ID/spouse/beneficiary requests are untouched
// by this script and stay in the normal manual queue.
//
// Always prints a dry-run summary first. Nothing is approved until you confirm the printed
// count, and the confirmation step requires a real, active SUPER_ADMIN/NATIONAL_ADMIN account
// to attribute the bulk action to in the audit log.
//
// Run with:
//   npx tsx scripts/bulk-approve-phone-only-changes.ts
//
// Set BULK_APPROVE_API_BASE to override the default http://127.0.0.1:4000/api (useful if this
// is ever run somewhere other than directly on the API host).

const API_BASE = process.env.BULK_APPROVE_API_BASE ?? "http://127.0.0.1:4000/api";
const BATCH_SIZE = 100;

type ChangeRequestRow = {
  id: number;
  proposedData: unknown;
  member: { id: number; controllerId: string; fullName: string; phone: string | null };
};

function isPhoneOnly(proposedData: unknown): proposedData is { phone: string | null } {
  if (!proposedData || typeof proposedData !== "object" || Array.isArray(proposedData)) return false;
  const keys = Object.keys(proposedData as Record<string, unknown>);
  return keys.length === 1 && keys[0] === "phone";
}

async function main() {
  const pending = (await prisma.memberChangeRequest.findMany({
    where: { status: "PENDING", type: "MEMBER_DETAILS" },
    select: {
      id: true,
      proposedData: true,
      member: { select: { id: true, controllerId: true, fullName: true, phone: true } },
    },
    orderBy: { id: "asc" },
  })) as ChangeRequestRow[];

  const phoneOnly = pending.filter((item) => isPhoneOnly(item.proposedData));

  console.log(
    `${pending.length} pending MEMBER_DETAILS requests; ${phoneOnly.length} are phone-number-only.`,
  );
  if (phoneOnly.length === 0) return;

  console.log("\nSample (first 20):");
  for (const item of phoneOnly.slice(0, 20)) {
    const next = (item.proposedData as { phone: string | null }).phone;
    console.log(
      `  #${item.id}  ${item.member.controllerId}  ${item.member.fullName}  ${item.member.phone ?? "(none)"} -> ${next}`,
    );
  }
  if (phoneOnly.length > 20) console.log(`  ... and ${phoneOnly.length - 20} more`);

  const proceed = await confirm({
    message: `Approve all ${phoneOnly.length} phone-only requests now? This updates live member records and notifies each member.`,
    default: false,
  });
  if (!proceed) {
    console.log("No changes made.");
    return;
  }

  const email = (await input({ message: "Your admin email (recorded as the reviewer for every approval):" }))
    .trim()
    .toLowerCase();
  const actor = await prisma.user.findUnique({ where: { email } });
  if (!actor || !actor.isActive || !["SUPER_ADMIN", "NATIONAL_ADMIN"].includes(actor.role)) {
    throw new Error("An active SUPER_ADMIN or NATIONAL_ADMIN with that email was not found");
  }
  const token = await createAccessToken(actor.id);

  let succeeded = 0;
  let failed = 0;
  const failures: Array<{ id: number; message?: string }> = [];

  for (let i = 0; i < phoneOnly.length; i += BATCH_SIZE) {
    const batch = phoneOnly.slice(i, i + BATCH_SIZE);
    const response = await fetch(`${API_BASE}/change-requests/bulk/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ changeRequestIds: batch.map((item) => item.id), action: "APPROVE" }),
    });
    if (!response.ok) {
      console.error(`Batch starting at #${batch[0].id} failed with HTTP ${response.status}`);
      failed += batch.length;
      continue;
    }
    const body = (await response.json()) as {
      data: { succeeded: number; failed: number; results: Array<{ id: number; success: boolean; message?: string }> };
    };
    succeeded += body.data.succeeded;
    failed += body.data.failed;
    for (const result of body.data.results) if (!result.success) failures.push(result);
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${body.data.succeeded} approved, ${body.data.failed} failed.`);
  }

  console.log(`\nDone. ${succeeded} approved, ${failed} failed.`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const item of failures) console.log(`  #${item.id}: ${item.message}`);
  }
}

main()
  .catch((error) => {
    if (error instanceof Error && error.name === "ExitPromptError") {
      console.log("\nCancelled. No changes made.");
      return;
    }
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
