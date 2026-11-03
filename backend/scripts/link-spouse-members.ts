import { confirm } from "@inquirer/prompts";

import { prisma } from "../src/lib/prisma.js";

// One-time backfill: for every Spouse row whose ghanaCardId already matches an independently
// enrolled ACTIVE/FLAGGED Member (a real member who was separately recorded as someone else's
// spouse before this feature shipped), sets Spouse.linkedMemberId so claims.routes.ts's
// activeBenefit() pays the full member rate, and so that member's own self-service account
// setup is no longer wrongly blocked by the stale spouse row.
//
// Run with: npx tsx scripts/link-spouse-members.ts
// Always prints a dry-run list first; nothing is changed until you confirm.

async function main() {
  const candidates = await prisma.spouse.findMany({
    where: { ghanaCardId: { not: null }, linkedMemberId: null },
    select: {
      id: true,
      fullName: true,
      ghanaCardId: true,
      memberId: true,
      member: { select: { fullName: true, controllerId: true } },
    },
  });

  const matches: Array<{
    spouseId: number;
    spouseName: string;
    ownerLabel: string;
    memberId: number;
    memberLabel: string;
  }> = [];

  for (const spouse of candidates) {
    const member = await prisma.member.findFirst({
      where: {
        ghanaCardId: spouse.ghanaCardId!,
        status: { in: ["ACTIVE", "FLAGGED"] },
        id: { not: spouse.memberId }, // defensive -- the "same card for both" case is already
        // blocked at every write site, so this should never actually match
      },
      select: { id: true, fullName: true, controllerId: true },
    });
    if (member) {
      matches.push({
        spouseId: spouse.id,
        spouseName: spouse.fullName,
        ownerLabel: `${spouse.member.fullName} (${spouse.member.controllerId})`,
        memberId: member.id,
        memberLabel: `${member.fullName} (${member.controllerId})`,
      });
    }
  }

  if (matches.length === 0) {
    console.log("No stale spouse-member overlaps found. Nothing to do.");
    return;
  }

  console.log(
    `${matches.length} spouse record(s) match an independently-enrolled member by Ghana Card ID:\n`,
  );
  for (const match of matches) {
    console.log(
      `  Spouse "${match.spouseName}" (recorded under ${match.ownerLabel}) -> links to member ${match.memberLabel}`,
    );
  }

  const proceed = await confirm({
    message: `\nSet linkedMemberId on all ${matches.length} of these?`,
    default: false,
  });
  if (!proceed) {
    console.log("No changes made.");
    return;
  }

  let updated = 0;
  for (const match of matches) {
    await prisma.spouse.update({
      where: { id: match.spouseId },
      data: { linkedMemberId: match.memberId },
    });
    updated += 1;
  }

  console.log(
    `\nLinked ${updated} spouse record(s). Re-run this script any time; it only touches rows still unlinked.`,
  );
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
