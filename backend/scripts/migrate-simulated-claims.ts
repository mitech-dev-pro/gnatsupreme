import { confirm } from "@inquirer/prompts";

import { prisma } from "../src/lib/prisma.js";

// One-time migration: release/live has historical member-filed claims recorded with
// provider="SIMULATION" from before the Mankrado integration existed on that branch -- they were
// stored for record-keeping but never put through a real review/delivery pipeline. Flipping
// provider to "Claims System" makes them reviewable through the normal staff workflow (approve
// now actually sends them to Mankrado for the first time; return/reject work as they always did)
// without the member having to refile. Scoped tightly: only PENDING, never-reviewed,
// member-portal-sourced rows -- anything already reviewed, returned, or rejected is left alone,
// since those already went through a real decision under the old regime and re-triggering that
// decision's side effects (e.g. a notification) would be wrong.
//
// Run with:
//   npx tsx scripts/migrate-simulated-claims.ts
// Always prints a dry-run list first; nothing is changed until you confirm.

async function main() {
  const candidates = await prisma.externalClaimSubmission.findMany({
    where: {
      provider: "SIMULATION",
      source: "MEMBER_PORTAL",
      status: "PENDING",
      reviewedAt: null,
    },
    select: {
      id: true,
      claimType: true,
      claimantName: true,
      createdAt: true,
      member: { select: { controllerId: true, fullName: true } },
    },
    orderBy: { id: "asc" },
  });

  if (candidates.length === 0) {
    console.log("No pending, unreviewed SIMULATION claims found. Nothing to do.");
    return;
  }

  console.log(`${candidates.length} claim(s) will be switched to provider "Claims System":\n`);
  for (const item of candidates) {
    console.log(
      `  #${item.id}  ${item.member.controllerId}  ${item.member.fullName}  ${item.claimType}  filed ${item.createdAt.toISOString().slice(0, 10)}`,
    );
  }
  console.log(
    "\nAfter this, staff can review these normally -- approving one will send it to Mankrado for the first time.",
  );

  const proceed = await confirm({
    message: `\nSwitch all ${candidates.length} claim(s) to provider "Claims System"?`,
    default: false,
  });
  if (!proceed) {
    console.log("No changes made.");
    return;
  }

  const result = await prisma.externalClaimSubmission.updateMany({
    where: { id: { in: candidates.map((item) => item.id) } },
    data: { provider: "Claims System" },
  });

  console.log(`\nMigrated ${result.count} claim(s).`);
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
