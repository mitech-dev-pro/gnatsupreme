import { unlink } from "node:fs/promises";
import path from "node:path";

import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";

import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { authorizeRoles } from "../../middleware/authorize.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  hasValidReport20Signature,
  report20FileUpload,
  uploadRoot,
} from "../files/file.storage.js";
import { parseReport20, reconcileReport20, sha256File } from "./report20.service.js";

export const importRouter = Router();

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const reportMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .transform((value) => new Date(`${value}-01T00:00:00.000Z`))
  .optional();
const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
});
const issueListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  status: z.enum(["MATCHED", "CHANGED", "UNMATCHED", "DUPLICATE", "INVALID", "ENROLLED"]).optional(),
});

function user(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

function receiveReport(request: Request, response: Response, next: NextFunction) {
  report20FileUpload.single("file")(request, response, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      response.status(413).json({ success: false, message: "File exceeds the configured upload limit" });
      return;
    }
    response.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "File upload failed",
    });
  });
}

async function removeFile(filePath: string) {
  await unlink(filePath).catch(() => undefined);
}

// Runs parsing + reconciliation off the request/response cycle so large files (up to
// MAX_ROWS = 300,000) don't hold an HTTP connection open or risk a gateway timeout. This is
// deliberately the simplest "background job" shape (fire-and-forget within the same process) —
// a straightforward stepping stone toward a real queue (Redis + BullMQ) later, once one is needed.
// It does NOT move the CPU-bound parsing work off Node's event loop; other requests can still be
// delayed while a very large file is being parsed.
async function runReport20Job(
  request: Request,
  currentUser: AuthenticatedUser,
  job: { id: number },
  filePath: string,
  mimeType: string,
  originalName: string,
  action: "REPORT20_IMPORTED" | "REPORT20_RECONCILE_RERUN",
) {
  try {
    const rows = await parseReport20(filePath, mimeType);
    await reconcileReport20(job.id, rows);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Report reconciliation failed";
    await prisma.importJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
    await recordAudit({
      request,
      actor: currentUser,
      action: "REPORT20_IMPORT_FAILED",
      entityType: "IMPORT_JOB",
      entityId: job.id,
      description: `Report 20 processing failed for ${originalName}`,
      afterData: { status: "FAILED", errorMessage: message },
    });
    return;
  }

  const completedJob = await prisma.importJob.findUnique({ where: { id: job.id } });
  await recordAudit({
    request,
    actor: currentUser,
    action,
    entityType: "IMPORT_JOB",
    entityId: job.id,
    description:
      action === "REPORT20_IMPORTED"
        ? `Imported Report 20 file ${originalName}`
        : `Re-ran reconciliation for Report 20 file ${originalName} against current members`,
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

const jobInclude = {
  file: { select: { id: true, originalName: true, sizeBytes: true, downloadPath: true } },
  uploadedBy: { select: { id: true, fullName: true, email: true } },
} as const;

importRouter.use(authenticate, authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN"));

importRouter.post("/report-20", receiveReport, async (request, response) => {
  if (!request.file) {
    response.status(400).json({ success: false, message: "Attach one CSV or XLSX file using the 'file' field" });
    return;
  }
  const reportMonth = reportMonthSchema.safeParse(request.body.reportMonth || undefined);
  if (!reportMonth.success) {
    await removeFile(request.file.path);
    response.status(400).json({ success: false, message: "reportMonth must use YYYY-MM format" });
    return;
  }
  if (!(await hasValidReport20Signature(request.file.path, request.file.mimetype))) {
    await removeFile(request.file.path);
    response.status(400).json({ success: false, message: "File content does not match its declared type" });
    return;
  }

  const checksum = await sha256File(request.file.path);
  const duplicate = await prisma.importJob.findUnique({
    where: { type_checksum: { type: "REPORT_20", checksum } },
    select: { id: true, status: true, createdAt: true, fileId: true, matchedRows: true, changedRows: true, file: { select: { storagePath: true } } },
  });
  if (duplicate) {
    // Only block a re-upload once this file actually reconciled something. A failed run, or one that completed
    // but matched/changed no members (e.g. every row was invalid), shouldn't permanently lock the file out.
    if (duplicate.matchedRows + duplicate.changedRows > 0) {
      await removeFile(request.file.path);
      response.status(409).json({
        success: false,
        message: "This exact Report 20 file has already been uploaded",
        duplicateImport: duplicate,
      });
      return;
    }
    await prisma.importJob.delete({ where: { id: duplicate.id } });
    await prisma.storedFile.delete({ where: { id: duplicate.fileId } }).catch(() => undefined);
    await removeFile(path.join(uploadRoot, duplicate.file.storagePath));
  }

  const currentUser = user(response);
  const storagePath = path.posix.join("report-20", request.file.filename);
  const [storedFile, job] = await prisma
    .$transaction(async (transaction) => {
      const file = await transaction.storedFile.create({
        data: {
          category: "REPORT_20",
          originalName: path.basename(request.file!.originalname),
          storedName: request.file!.filename,
          mimeType: request.file!.mimetype,
          sizeBytes: request.file!.size,
          storagePath,
          downloadPath: `/api/files/${request.file!.filename}`,
          uploadedById: currentUser.id,
        },
      });
      const createdJob = await transaction.importJob.create({
        data: {
          type: "REPORT_20",
          checksum,
          fileId: file.id,
          uploadedById: currentUser.id,
          reportMonth: reportMonth.data,
        },
      });
      return [file, createdJob] as const;
    })
    .catch(async (error) => {
      await removeFile(request.file!.path);
      throw error;
    });

  // Kick off parsing + reconciliation in the background; respond immediately with the
  // PENDING job so the client isn't stuck holding a connection open for a large file.
  void runReport20Job(request, currentUser, job, request.file.path, request.file.mimetype, storedFile.originalName, "REPORT20_IMPORTED").catch(
    (error) => logger.error({ err: error, importJobId: job.id }, "Unhandled error while processing Report 20 job"),
  );

  const pendingJob = await prisma.importJob.findUnique({ where: { id: job.id }, include: jobInclude });
  response.status(202).json({ success: true, data: pendingJob });
});

importRouter.get("/", async (request, response) => {
  const parsed = listSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ success: false, message: "Invalid query" });
    return;
  }
  const { page, limit, status } = parsed.data;
  const where = { type: "REPORT_20" as const, ...(status ? { status } : {}) };
  const [jobs, total] = await prisma.$transaction([
    prisma.importJob.findMany({ where, include: jobInclude, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.importJob.count({ where }),
  ]);
  response.json({ success: true, data: jobs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

importRouter.get("/:id", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid import ID" });
    return;
  }
  const job = await prisma.importJob.findFirst({ where: { id: params.data.id, type: "REPORT_20" }, include: jobInclude });
  if (!job) {
    response.status(404).json({ success: false, message: "Import not found" });
    return;
  }
  response.json({ success: true, data: job });
});

importRouter.post("/:id/rerun", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid import ID" });
    return;
  }
  const job = await prisma.importJob.findFirst({
    where: { id: params.data.id, type: "REPORT_20", status: "COMPLETED" },
    include: { file: { select: { originalName: true, storagePath: true, mimeType: true } } },
  });
  if (!job) {
    response.status(404).json({ success: false, message: "Completed Report 20 import not found" });
    return;
  }
  const currentUser = user(response);
  await prisma.importJob.update({ where: { id: job.id }, data: { status: "PENDING", errorMessage: null, completedAt: null } });

  void runReport20Job(
    request,
    currentUser,
    job,
    path.join(uploadRoot, job.file.storagePath),
    job.file.mimeType,
    job.file.originalName,
    "REPORT20_RECONCILE_RERUN",
  ).catch((error) => logger.error({ err: error, importJobId: job.id }, "Unhandled error while re-running Report 20 job"));

  const pendingJob = await prisma.importJob.findUnique({ where: { id: job.id }, include: jobInclude });
  response.status(202).json({ success: true, data: pendingJob });
});

importRouter.get("/:id/issues", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  const query = issueListSchema.safeParse(request.query);
  if (!params.success || !query.success) {
    response.status(400).json({ success: false, message: "Invalid request" });
    return;
  }
  const exists = await prisma.importJob.findFirst({ where: { id: params.data.id, type: "REPORT_20" }, select: { id: true } });
  if (!exists) {
    response.status(404).json({ success: false, message: "Import not found" });
    return;
  }
  const { page, limit, status } = query.data;
  const where = { importJobId: params.data.id, ...(status ? { status } : { status: { not: "MATCHED" as const } }) };
  const [rows, total] = await prisma.$transaction([
    prisma.report20Row.findMany({ where, include: { member: { select: { id: true, controllerId: true, fullName: true } } }, orderBy: { rowNumber: "asc" }, skip: (page - 1) * limit, take: limit }),
    prisma.report20Row.count({ where }),
  ]);
  response.json({ success: true, data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});
