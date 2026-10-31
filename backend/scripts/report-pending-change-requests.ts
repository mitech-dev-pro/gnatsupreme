import { prisma } from "../src/lib/prisma.js";

// Breaks down PENDING member change requests by type, and MEMBER_DETAILS further by which
// field(s) were proposed (a request can touch more than one field at once, so a single request
// can count toward more than one field bucket below). Run with:
//   npx tsx scripts/report-pending-change-requests.ts

const FIELD_LABELS: Record<string, string> = {
  phone: "Mobile number",
  fullName: "Name",
  ghanaCardId: "Ghana Card ID",
  school: "School",
};

async function main() {
  const pending = await prisma.memberChangeRequest.findMany({
    where: { status: "PENDING" },
    select: { type: true, proposedData: true, requestedAt: true },
  });

  if (pending.length === 0) {
    console.log("No pending change requests.");
    return;
  }

  const byType = new Map<string, number>();
  const byField = new Map<string, number>();

  for (const item of pending) {
    byType.set(item.type, (byType.get(item.type) ?? 0) + 1);
    if (
      item.type === "MEMBER_DETAILS" &&
      item.proposedData &&
      typeof item.proposedData === "object"
    ) {
      for (const key of Object.keys(item.proposedData as Record<string, unknown>)) {
        const label = FIELD_LABELS[key] ?? key;
        byField.set(label, (byField.get(label) ?? 0) + 1);
      }
    }
  }

  const oldest = pending.reduce(
    (min, item) => (item.requestedAt < min ? item.requestedAt : min),
    pending[0].requestedAt,
  );

  console.log(`Pending change requests: ${pending.length}`);
  console.log(`Oldest pending since: ${oldest.toISOString()}`);
  console.log("\nBy type:");
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(20)} ${count}`);
  }

  if (byField.size > 0) {
    console.log("\nMEMBER_DETAILS, by field proposed (a request may touch more than one):");
    for (const [label, count] of [...byField.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${label.padEnd(20)} ${count}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
