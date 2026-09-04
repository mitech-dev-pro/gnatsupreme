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

// Runs inside the dedicated worker process (see ../../worker.ts), consumed off the BullMQ
// "report20" queue — so the CPU-bound Excel/CSV parsing for large files never blocks the API
// server's event loop, which stays responsive to every other request while this runs. Writes audit
// entries directly (rather than via an Express Request) since a queued job has no live request.
export async function processReport20Job(data: Report20WorkerData) {
  try {
    // Passed inline rather than bound to a local `rows` variable, so this scope holds no
    // separate reference to the parsed rows -- reconcileReport20 can drop its own reference
    // once classification is done (see report20.service.ts) and actually free the memory,
    // instead of this awaited call keeping it alive for the whole job regardless.
    await reconcileReport20(data.importJobId, await parseReport20(data.filePath, data.mimeType));
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
