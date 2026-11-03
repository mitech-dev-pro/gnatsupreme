import { prisma } from "../../lib/prisma.js";
import type { AuthenticatedUser } from "../../middleware/authenticate.js";
import { recordAudit } from "../audit/audit.service.js";
import { stageMemberImport } from "./member-import.service.js";

export type MemberImportWorkerData = {
  importJobId: number;
  attemptStartedAt?: string;
  filePath: string;
  mimeType: string;
  originalName: string;
  actorUser: AuthenticatedUser;
  auditContext: { ip?: string; userAgent?: string };
};

// Runs inside the dedicated worker process (see ../../worker.ts), consumed off the BullMQ
// "member-import" queue, for the same reason report20.worker.ts does — the Excel/CSV parsing here
// is CPU-bound and would otherwise block the main API server for the whole time a large file is
// being staged.
export async function processMemberImportJob(data: MemberImportWorkerData) {
  const attempt = await prisma.importJob.findUnique({
    where: { id: data.importJobId },
    select: { startedAt: true, status: true },
  });
  if (
    !attempt ||
    attempt.status !== "PROCESSING" ||
    (data.attemptStartedAt && attempt.startedAt?.toISOString() !== data.attemptStartedAt)
  )
    return;
  const startedAt = attempt.startedAt!;
  // A delayed validation message must not re-stage an import already in enrollment.
  if (await prisma.memberBulkImportRow.count({ where: { importJobId: data.importJobId } })) return;
  try {
    await stageMemberImport(
      data.importJobId,
      data.filePath,
      data.mimeType,
      data.actorUser,
      startedAt,
    );
  } catch (error) {
    await prisma.importJob
      .updateMany({
        where: { id: data.importJobId, status: "PROCESSING", startedAt },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Validation failed",
          completedAt: new Date(),
        },
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
      ? {
          totalRows: completed.totalRows,
          readyRows: completed.readyRows,
          invalidRows: completed.invalidRows,
          duplicateRows: completed.duplicateRows,
        }
      : undefined,
  });
}
