import { prisma } from "../src/lib/prisma.js";

// Read-only report: lists SPOUSE claims that were paid the spousal rate but, under current
// linking, should have been paid the full member rate -- i.e. claims that are now underpaid.
// Does NOT auto-correct anything; a human decides what to do with each listed claim.
//
// Run AFTER scripts/link-spouse-members.ts has established links -- this only considers claims
// whose spouse is currently linked (Spouse.linkedMemberId set).
//
// Eligibility date for the linked member (the point they first became eligible for the member
// rate) is, in order:
//   1. Their earliest APPROVED MemberWorkflowEvent, if one exists -- an approval means they
//      were created PENDING, so createdAt alone would be wrong for them. REACTIVATED is
//      deliberately NOT used here: it means they were already eligible at some earlier point,
//      went INACTIVE, and came back -- using it would wrongly exclude claims submitted during
//      that earlier eligible period.
//   2. Else, their createdAt -- correct whenever there's no APPROVED event, whether because
//      they were created ACTIVE directly (bulk import, Report20 auto-enroll) or because their
//      only event is REACTIVATED (which doesn't mark a first-eligibility date, per above).
//   3. If somehow neither resolves, the claim is still listed, marked "eligibility date
//      unknown -- review manually" rather than silently dropped or silently flagged.
//
// Run with: npx tsx scripts/report-underpaid-spouse-claims.ts

async function eligibilityDate(
  linkedMemberId: number,
): Promise<{ date: Date | null; source: string }> {
  const approved = await prisma.memberWorkflowEvent.findFirst({
    where: { memberId: linkedMemberId, action: "APPROVED" },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (approved) return { date: approved.createdAt, source: "APPROVED event" };

  const member = await prisma.member.findUnique({
    where: { id: linkedMemberId },
    select: { createdAt: true },
  });
  if (member) return { date: member.createdAt, source: "createdAt" };

  return { date: null, source: "unknown" };
}

async function main() {
  const claims = await prisma.externalClaimSubmission.findMany({
    where: {
      claimantType: "SPOUSE",
      status: { not: "FAILED" },
      claimType: { not: null },
      submittedAt: { not: null },
      member: { spouse: { linkedMemberId: { not: null } } },
    },
    select: {
      id: true,
      claimType: true,
      submittedAt: true,
      estimatedAmount: true,
      member: {
        select: {
          controllerId: true,
          spouse: { select: { linkedMemberId: true } },
        },
      },
    },
    orderBy: { submittedAt: "asc" },
  });

  if (claims.length === 0) {
    console.log("No linked SPOUSE claims found. Nothing to check.");
    return;
  }

  const mismatches: Array<{
    claimId: number;
    controllerId: string;
    claimType: string;
    submittedAt: Date;
    storedAmount: string;
    correctAmount: string;
    eligibilitySource: string;
  }> = [];
  let skippedUnknownEligibility = 0;

  for (const claim of claims) {
    const linkedMemberId = claim.member.spouse!.linkedMemberId!;
    const { date: eligibleFrom, source } = await eligibilityDate(linkedMemberId);

    if (eligibleFrom === null) {
      mismatches.push({
        claimId: claim.id,
        controllerId: claim.member.controllerId,
        claimType: claim.claimType!,
        submittedAt: claim.submittedAt!,
        storedAmount: claim.estimatedAmount?.toString() ?? "null",
        correctAmount: "eligibility date unknown -- review manually",
        eligibilitySource: "unknown",
      });
      skippedUnknownEligibility += 1;
      continue;
    }

    // Correctly paid spousal rate at the time -- not actually underpaid.
    if (claim.submittedAt! < eligibleFrom) continue;

    const planVersion = await prisma.benefitPlanVersion.findFirst({
      where: { effectiveFrom: { lte: claim.submittedAt! } },
      orderBy: { effectiveFrom: "desc" },
      include: { benefits: { where: { type: claim.claimType! } } },
    });
    const correctAmount = planVersion?.benefits[0]?.memberAmount;
    if (correctAmount === undefined) continue; // no benefit configured for this type/date -- nothing to compare

    const storedAmount = claim.estimatedAmount;
    if (storedAmount !== null && storedAmount.equals(correctAmount)) continue; // already correct

    mismatches.push({
      claimId: claim.id,
      controllerId: claim.member.controllerId,
      claimType: claim.claimType!,
      submittedAt: claim.submittedAt!,
      storedAmount: storedAmount?.toString() ?? "null",
      correctAmount: correctAmount.toString(),
      eligibilitySource: source,
    });
  }

  if (mismatches.length === 0) {
    console.log(`Checked ${claims.length} linked SPOUSE claim(s). No mismatches found.`);
    return;
  }

  console.log(
    `${mismatches.length} of ${claims.length} linked SPOUSE claim(s) may be underpaid:\n`,
  );
  for (const item of mismatches) {
    console.log(
      `  Claim #${item.claimId}  ${item.controllerId}  ${item.claimType}  submitted ${item.submittedAt.toISOString().slice(0, 10)}  ` +
        `stored=${item.storedAmount}  correct=${item.correctAmount}  (eligibility: ${item.eligibilitySource})`,
    );
  }
  if (skippedUnknownEligibility > 0) {
    console.log(
      `\n${skippedUnknownEligibility} claim(s) have an unknown eligibility date -- review those manually.`,
    );
  }
  console.log("\nThis is a read-only report. No claim amounts were changed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
