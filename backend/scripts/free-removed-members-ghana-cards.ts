import { confirm } from "@inquirer/prompts";

import { prisma } from "../src/lib/prisma.js";

// One-time backfill: clears ghanaCardId for every already-REMOVED member (and their spouse's),
// matching the behavior the removal workflow now applies going forward (see
// memberWorkflowRouter's POST /:id/remove). ghanaCardId is globally unique on both Member and
// Spouse, and REMOVED has no reactivation path back to active, so a removed member's card
// should never still block a genuinely new person from enrolling with it. Before this fix,
// removal only flipped `status`, so any member removed before this change is still holding
// their card and will keep producing false "Ghana Card already in use" errors for new enrollees
// until this runs.
//
// Run with:
//   npx tsx scripts/free-removed-members-ghana-cards.ts
// Always prints a dry-run list first; nothing is changed until you confirm.

async function main() {
  const removedWithCard = await prisma.member.findMany({
    where: { status: "REMOVED", ghanaCardId: { not: null } },
    select: {
      id: true,
      controllerId: true,
      fullName: true,
      ghanaCardId: true,
      spouse: { select: { id: true, ghanaCardId: true } },
    },
  });

  if (removedWithCard.length === 0) {
    console.log("No removed members are still holding a Ghana Card ID. Nothing to do.");
    return;
  }

  console.log(`${removedWithCard.length} removed member(s) still hold a Ghana Card ID:\n`);
  for (const item of removedWithCard) {
    const spouseNote = item.spouse?.ghanaCardId ? ` (spouse card ${item.spouse.ghanaCardId} too)` : "";
    console.log(`  ${item.controllerId}  ${item.fullName}  ${item.ghanaCardId}${spouseNote}`);
  }

  const proceed = await confirm({
    message: `\nClear the Ghana Card ID on all ${removedWithCard.length} of these (and any held by their spouse)?`,
    default: false,
  });
  if (!proceed) {
    console.log("No changes made.");
    return;
  }

  const memberIds = removedWithCard.map((item) => item.id);
  const [members, spouses] = await prisma.$transaction([
    prisma.member.updateMany({ where: { id: { in: memberIds } }, data: { ghanaCardId: null } }),
    prisma.spouse.updateMany({ where: { memberId: { in: memberIds } }, data: { ghanaCardId: null } }),
  ]);

  console.log(`\nCleared ${members.count} member card(s) and ${spouses.count} spouse card(s).`);
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
