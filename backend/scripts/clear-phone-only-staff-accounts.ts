import { confirm } from "@inquirer/prompts";

import { prisma } from "../src/lib/prisma.js";
import { Prisma } from "../src/generated/prisma/client.js";

// Clears every phone-capable staff account (phone IS NOT NULL) -- exactly and only the
// bulk-created accounts from bulk-create-staff-admins.ts, never a classic email+password
// admin (phone === null) -- so they can be recreated under the simplified-onboarding scheme.
//
// --dry-run only reports; it never deletes anything. Its reporting query uses raw SQL with an
// explicit column list, never the generated Prisma client's typed `findMany` (which would
// default-select every scalar the *client* knows about, including columns the *live database*
// might not have yet, or miss ones it's about to drop) -- this is what lets the dry run be run
// safely BEFORE the schema migration that removes pending_email/pending_email_expires_at, per
// the simplified-onboarding plan's order of operations: dry-run first (full visibility into who
// already has a pending email in flight, while that's still visible at all), then back up, then
// migrate, then the real delete (which only ever runs after the migration, using the regular
// generated client).
//
// Run with:
//   npx tsx scripts/clear-phone-only-staff-accounts.ts --dry-run
//   npx tsx scripts/clear-phone-only-staff-accounts.ts

const dryRun = process.argv.includes("--dry-run");

type CandidateRow = {
  id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  setup_required: boolean;
  pending_email: string | null;
};

// Works whether or not the simplify-onboarding migration has already run -- pending_email is
// only there to show, pre-migration, whether anyone had an email confirmation in flight; once
// the migration has dropped that column, this falls back to the same query without it rather
// than hard-failing.
async function fetchCandidates(): Promise<CandidateRow[]> {
  try {
    return await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      SELECT id, full_name, phone, email, setup_required, pending_email
      FROM users
      WHERE phone IS NOT NULL
      ORDER BY id
    `);
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2010") {
      throw error;
    }
    const rows = await prisma.$queryRaw<Omit<CandidateRow, "pending_email">[]>(Prisma.sql`
      SELECT id, full_name, phone, email, setup_required
      FROM users
      WHERE phone IS NOT NULL
      ORDER BY id
    `);
    return rows.map((row) => ({ ...row, pending_email: null }));
  }
}

async function main() {
  const rows = await fetchCandidates();

  console.log(`${rows.length} phone-capable account(s) found.\n`);
  if (rows.length === 0) {
    console.log("Nothing to clear.");
    return;
  }

  const ids = rows.map((r) => r.id);
  // The only onDelete: Restrict relations to User (confirmed by a full schema scan) -- an
  // account referenced by either would fail a plain delete partway through, so these are
  // checked and skipped, not force-deleted. A brand-new bulk-created secretary account should
  // never have created a benefit plan version or a member transfer, but this verifies that
  // instead of assuming it.
  const [benefitPlanRows, transferRows] = await Promise.all([
    prisma.benefitPlanVersion.groupBy({
      by: ["createdById"],
      where: { createdById: { in: ids } },
      _count: { _all: true },
    }),
    prisma.memberTransfer.findMany({
      where: { OR: [{ requestedById: { in: ids } }, { reviewedById: { in: ids } }] },
      select: { requestedById: true, reviewedById: true },
    }),
  ]);
  const blockedIds = new Set<number>();
  for (const row of benefitPlanRows) blockedIds.add(row.createdById);
  for (const row of transferRows) {
    blockedIds.add(row.requestedById);
    if (row.reviewedById) blockedIds.add(row.reviewedById);
  }

  const toDelete = rows.filter((r) => !blockedIds.has(r.id));
  const blocked = rows.filter((r) => blockedIds.has(r.id));

  console.log(`${toDelete.length} account(s) will be deleted.`);
  for (const row of toDelete) {
    const flags = [
      row.setup_required ? "setupRequired" : null,
      row.email ? `email=${row.email}` : null,
      row.pending_email ? `pendingEmail=${row.pending_email}` : null,
    ].filter(Boolean);
    console.log(
      `  #${row.id}  ${row.full_name}  ${row.phone}${flags.length ? `  (${flags.join(", ")})` : ""}`,
    );
  }

  if (blocked.length > 0) {
    console.log(
      `\n${blocked.length} account(s) SKIPPED -- referenced by a benefit plan version or member transfer, needs manual review:`,
    );
    for (const row of blocked) console.log(`  #${row.id}  ${row.full_name}  ${row.phone}`);
  }

  if (dryRun) {
    console.log("\nDry run only -- nothing was deleted.");
    return;
  }

  if (toDelete.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  const proceed = await confirm({
    message: `Delete ${toDelete.length} phone-capable staff account(s) now? This cannot be undone.`,
    default: false,
  });
  if (!proceed) {
    console.log("No changes made.");
    return;
  }

  // A single deleteMany is already atomic -- no need for $transaction's interactive-transaction
  // wrapper (BEGIN/COMMIT with its own 5s client-side timeout), which failed here on 122 rows.
  const deleteIds = toDelete.map((r) => r.id);
  const result = await prisma.user.deleteMany({ where: { id: { in: deleteIds } } });
  console.log(`\n${result.count} account(s) deleted.`);
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
