import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import type { ImportStatus } from "../../generated/prisma/client.js";

export async function claimMemberImport(
  job: { id: number; status: ImportStatus; updatedAt: Date },
  totalRows: number,
  readyRows: number,
) {
  const startedAt = new Date();
  const result = await prisma.importJob.updateMany({
    where: { id: job.id, status: job.status, updatedAt: job.updatedAt },
    data: {
      status: "PROCESSING",
      startedAt,
      completedAt: null,
      errorMessage: null,
      totalRows,
      processedRows: Math.max(0, totalRows - readyRows),
    },
  });
  if (!result.count)
    throw new AppError(
      409,
      "This import changed or another attempt started. Refresh before trying again.",
    );
  return startedAt;
}

export const RECOVERY_STATUSES = [
  "INVALID",
  "FAILED",
  "DUPLICATE",
  "EXISTING",
  "OUT_OF_SCOPE",
] as const;
export const recoveryAction = (status: string) =>
  ({
    INVALID: "Correct the listed fields, then upload the corrected rows for validation.",
    FAILED:
      "Check the row details and listed issue, then upload the corrected rows for validation.",
    DUPLICATE:
      "Keep one row per member. Verify identifiers against your source before changing them.",
    EXISTING:
      "Skipped: this member already exists. Use the member profile to request updates; do not create another member.",
    OUT_OF_SCOPE:
      "Ask an administrator with access to the correct district or region to review this row.",
  })[status] ?? "Review this row before uploading it again.";
