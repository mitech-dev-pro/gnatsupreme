import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { recordAudit } from "../audit/audit.service.js";
import { parseReport20, reconcileReport20 } from "./report20.service.js";

export type Report20WorkerData = {
  importJobId: number;
  filePath: string;
  mimeType: string;
  originalName: string;
  action: "REPORT20_IMPORTED" | "REPORT20_RECONCILE_RERUN";
  actor: { id: number; email: string; regionId: number | null; districtId: number | null };
  auditContext: { ip?: string; userAgent?: string };
};

// Runs as its own child process (see spawn-worker.ts) so the CPU-bound Excel/CSV parsing for large
// files doesn't block the main API server's event loop — it stays responsive to every other
// request while this runs. Has its own PrismaClient and writes audit entries directly since
// there's no Express Request here (the process only has what was passed via WORKER_PAYLOAD).
async function run() {
  const data = JSON.parse(process.env.WORKER_PAYLOAD ?? "{}") as Report20WorkerData;
  try {
    const rows = await parseReport20(data.filePath, data.mimeType);
    await reconcileReport20(data.importJobId, rows);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Report reconciliation failed";
    await prisma.importJob.update({
      where: { id: data.importJobId },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
    await recordAudit({
      request: data.auditContext,
      actor: data.actor,
      action: "REPORT20_IMPORT_FAILED",
      entityType: "IMPORT_JOB",
      entityId: data.importJobId,
      description: `Report 20 processing failed for ${data.originalName}`,
      afterData: { status: "FAILED", errorMessage: message },
    });
    return;
  }

  const completedJob = await prisma.importJob.findUnique({ where: { id: data.importJobId } });
  await recordAudit({
    request: data.auditContext,
    actor: data.actor,
    action: data.action,
    entityType: "IMPORT_JOB",
    entityId: data.importJobId,
    description:
      data.action === "REPORT20_IMPORTED"
        ? `Imported Report 20 file ${data.originalName}`
        : `Re-ran reconciliation for Report 20 file ${data.originalName} against current members`,
    afterData: completedJob
      ? {
          status: completedJob.status,
          totalRows: completedJob.totalRows,
          matchedRows: completedJob.matchedRows,
          changedRows: completedJob.changedRows,
          unmatchedRows: completedJob.unmatchedRows,
          duplicateRows: completedJob.duplicateRows,
          invalidRows: completedJob.invalidRows,
          enrolledRows: completedJob.enrolledRows,
          flaggedForRemovalRows: completedJob.flaggedForRemovalRows,
        }
      : undefined,
  });
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    const data = JSON.parse(process.env.WORKER_PAYLOAD ?? "{}") as Report20WorkerData;
    logger.error({ err: error, importJobId: data.importJobId }, "Unhandled error in Report 20 worker");
    process.exit(1);
  });
