import { confirm, input } from "@inquirer/prompts";

import { prisma } from "../src/lib/prisma.js";
import { recordAudit } from "../src/modules/audit/audit.service.js";
import {
  applyChangeRequestDecision,
  type ChangeRequestWithMember,
} from "../src/modules/workflows/change-request.decision.js";
import { notifyChangeReviewed } from "../src/modules/workflows/change-request.notifications.js";
import type { AuthenticatedUser } from "../src/middleware/authenticate.js";
import type { ChangeRequestType } from "../src/generated/prisma/enums.js";

// Approves every PENDING member change request, system-wide -- the same applyChangeRequestDecision
// used by both the single-item PATCH /:id/review route and the 100-item-capped POST /bulk/review
// route, so a decision here behaves byte-identically to going through the UI. Unlike the HTTP
// route, there's no 100-item cap and no actor scope restriction (the running admin must be
// SUPER_ADMIN or NATIONAL_ADMIN, whose memberScope is unrestricted -- see reserveChangeReview,
// which would otherwise silently skip anything outside a narrower actor's scope).
//
// This approves blindly -- every proposed MEMBER_DETAILS/SPOUSE/BENEFICIARY_* change goes through
// exactly as submitted, with no per-item human review of what's actually being changed. Use
// --type to restrict to one request type at a time if that's too broad, and always read the
// dry-run output before confirming.
//
// Run with:
//   npx tsx scripts/bulk-approve-change-requests.ts --dry-run [--type=MEMBER_DETAILS]
//   npx tsx scripts/bulk-approve-change-requests.ts [--type=MEMBER_DETAILS]

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const typeArg = args.find((a) => a.startsWith("--type="))?.slice("--type=".length);
const VALID_TYPES: ChangeRequestType[] = [
  "MEMBER_DETAILS",
  "SPOUSE",
  "BENEFICIARY_ADD",
  "BENEFICIARY_UPDATE",
  "BENEFICIARY_REMOVE",
];
if (typeArg && !VALID_TYPES.includes(typeArg as ChangeRequestType)) {
  throw new Error(`--type must be one of: ${VALID_TYPES.join(", ")}`);
}

async function fetchPending(): Promise<ChangeRequestWithMember[]> {
  return prisma.memberChangeRequest.findMany({
    where: {
      status: "PENDING",
      ...(typeArg ? { type: typeArg as ChangeRequestType } : {}),
    },
    include: {
      member: { include: { beneficiaries: true, district: { select: { regionId: true } } } },
    },
    orderBy: { requestedAt: "asc" },
  });
}

async function main() {
  const pending = await fetchPending();

  console.log(
    `${pending.length} pending change request(s) found${typeArg ? ` (type=${typeArg})` : ""}.\n`,
  );
  if (pending.length === 0) {
    console.log("Nothing to approve.");
    return;
  }

  const byType = new Map<string, number>();
  for (const item of pending) byType.set(item.type, (byType.get(item.type) ?? 0) + 1);
  console.log("By type:");
  for (const [type, count] of byType) console.log(`  ${type}: ${count}`);

  console.log(`\nSample (first 10 of ${pending.length}):`);
  for (const item of pending.slice(0, 10)) {
    console.log(`  #${item.id}  ${item.type}  ${item.member.fullName} (member #${item.memberId})`);
  }

  if (dryRun) {
    console.log("\nDry run only -- nothing was approved.");
    return;
  }

  const proceed = await confirm({
    message: `Approve all ${pending.length} pending change request(s) now? This applies every proposed change as submitted, with no per-item review.`,
    default: false,
  });
  if (!proceed) {
    console.log("No changes made.");
    return;
  }

  const actorEmail = (await input({ message: "Your admin email (recorded in the audit log):" }))
    .trim()
    .toLowerCase();
  const actorRow = await prisma.user.findUnique({ where: { email: actorEmail } });
  if (
    !actorRow ||
    !actorRow.isActive ||
    !["SUPER_ADMIN", "NATIONAL_ADMIN"].includes(actorRow.role)
  ) {
    throw new Error("An active SUPER_ADMIN or NATIONAL_ADMIN with that email was not found");
  }
  const actor: AuthenticatedUser = {
    id: actorRow.id,
    fullName: actorRow.fullName,
    email: actorRow.email,
    setupRequired: actorRow.setupRequired,
    role: actorRow.role as AuthenticatedUser["role"],
    regionIds: actorRow.regionIds,
    districtIds: actorRow.districtIds,
  };
  const requestSource = { ip: null, userAgent: "bulk-approve-change-requests script" };

  let succeeded = 0;
  const failed: { id: number; memberName: string; message: string }[] = [];
  for (const item of pending) {
    try {
      const reviewed = await applyChangeRequestDecision(
        requestSource,
        item,
        actor,
        "APPROVE",
        null,
      );
      await recordAudit({
        request: requestSource,
        actor,
        action: `MEMBER_CHANGE_${reviewed.status}`,
        entityType: "MEMBER_CHANGE_REQUEST",
        entityId: item.id,
        description: `Bulk-approved ${item.type} change for ${item.member.fullName} (script)`,
        afterData: { status: reviewed.status, reviewNote: reviewed.reviewNote, bulk: true },
        regionId: item.member.district?.regionId,
        districtId: item.member.districtId,
      });
      await notifyChangeReviewed(reviewed);
      succeeded++;
    } catch (error) {
      failed.push({
        id: item.id,
        memberName: item.member.fullName,
        message: error instanceof Error ? error.message : "Approval failed",
      });
    }
  }

  console.log(`\n${succeeded} approved, ${failed.length} failed.`);
  for (const f of failed) console.log(`  #${f.id}  ${f.memberName}  ${f.message}`);
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
