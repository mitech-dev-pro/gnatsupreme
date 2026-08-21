import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthenticatedUser } from "../../middleware/authenticate.js";
import { recordAudit } from "../audit/audit.service.js";
import { stageMemberImport } from "./member-import.service.js";

export type MemberImportWorkerData = {
  importJobId: number;
  filePath: string;
  mimeType: string;
  originalName: string;
  actorUser: AuthenticatedUser;
  auditContext: { ip?: string; userAgent?: string };
};

// Runs as its own child process (see spawn-worker.ts) for the same reason report20.worker.ts does
// — the Excel/CSV parsing here is CPU-bound and would otherwise block the main API server for the
// whole time a large file is being staged.
async function run() {
  const data = JSON.parse(process.env.WORKER_PAYLOAD ?? "{}") as MemberImportWorkerData;
  try {
    await stageMemberImport(data.importJobId, data.filePath, data.mimeType, data.actorUser);
  } catch (error) {
    await prisma.importJob
      .update({
        where: { id: data.importJobId },
        data: { status: "FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Validation failed", completedAt: new Date() },
      })
      .catch(() => undefined);
    return;
  }
  const completed = await prisma.importJob.findUnique({ where: { id: data.importJobId } });
  await recordAudit({
    request: data.auditContext,
    actor: data.actorUser,
    action: "MEMBER_IMPORT_VALIDATED",
    entityType: "IMPORT_JOB",
    entityId: data.importJobId,
    description: `Validated bulk member import ${data.originalName}`,
    afterData: completed
      ? { totalRows: completed.totalRows, readyRows: completed.readyRows, invalidRows: completed.invalidRows, duplicateRows: completed.duplicateRows }
      : undefined,
  });
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    const data = JSON.parse(process.env.WORKER_PAYLOAD ?? "{}") as MemberImportWorkerData;
    logger.error({ err: error, importJobId: data.importJobId }, "Unhandled error in member import worker");
    process.exit(1);
  });
