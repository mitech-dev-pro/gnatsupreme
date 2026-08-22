import { unlink } from "node:fs/promises";
import path from "node:path";

import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";

import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { spawnWorker } from "../../lib/spawn-worker.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { recordAudit } from "../audit/audit.service.js";
import { hasValidReport20Signature, memberImportFileUpload, uploadRoot } from "../files/file.storage.js";
import { bulkRawFields } from "./member-import.service.js";
import type { MemberImportWorkerData } from "./member-import.worker.js";
import { sha256File } from "./report20.service.js";

export const memberImportRouter = Router();
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const rowQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  status: z.enum(["READY", "INVALID", "DUPLICATE", "EXISTING", "OUT_OF_SCOPE", "IMPORTED", "FAILED"]).optional(),
});
const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
});

function user(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

function receiveFile(request: Request, response: Response, next: NextFunction) {
  memberImportFileUpload.single("file")(request, response, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      response.status(413).json({ success: false, message: "File exceeds the configured upload limit" });
      return;
    }
    response.status(400).json({ success: false, message: error instanceof Error ? error.message : "Upload failed" });
  });
}

async function removeFile(filePath: string) {
  await unlink(filePath).catch(() => undefined);
}

function jobScope(currentUser: AuthenticatedUser) {
  return currentUser.role === "SUPER_ADMIN" || currentUser.role === "NATIONAL_ADMIN"
    ? {}
    : { uploadedById: currentUser.id };
}

function optionalDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

memberImportRouter.use(authenticate);

memberImportRouter.get("/members", async (request, response) => {
  const parsed = listSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ success: false, message: "Invalid query" });
    return;
  }
  const { page, limit, status } = parsed.data;
  const where = { type: "MEMBER_BULK" as const, ...jobScope(user(response)), ...(status ? { status } : {}) };
  const [jobs, total] = await prisma.$transaction([
    prisma.importJob.findMany({
      where,
      include: { file: { select: { originalName: true, downloadPath: true, sizeBytes: true } }, uploadedBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.importJob.count({ where }),
  ]);
  response.json({ success: true, data: jobs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

memberImportRouter.post("/members", receiveFile, async (request, response) => {
  if (!request.file) {
    response.status(400).json({ success: false, message: "Attach one CSV or XLSX file using the 'file' field" });
    return;
  }
  if (!(await hasValidReport20Signature(request.file.path, request.file.mimetype))) {
    await removeFile(request.file.path);
    response.status(400).json({ success: false, message: "File content does not match its declared type" });
    return;
  }
  const checksum = await sha256File(request.file.path);
  const duplicate = await prisma.importJob.findUnique({
    where: { type_checksum: { type: "MEMBER_BULK", checksum } },
    select: { id: true, status: true, fileId: true, importedRows: true, file: { select: { storagePath: true } } },
  });
  if (duplicate) {
    // Only block a re-upload once something was actually enrolled from this file. A failed run, or one that
    // staged successfully but never got committed (e.g. every row was invalid, or the admin just re-checks
    // after a fix), shouldn't permanently lock the file out of being retried.
    if (duplicate.importedRows > 0) {
      await removeFile(request.file.path);
      response.status(409).json({ success: false, message: "This exact member file has already been uploaded", duplicateImport: duplicate });
      return;
    }
    await prisma.importJob.delete({ where: { id: duplicate.id } });
    await prisma.storedFile.delete({ where: { id: duplicate.fileId } }).catch(() => undefined);
    await removeFile(path.join(uploadRoot, duplicate.file.storagePath));
  }
  const currentUser = user(response);
  const storagePath = path.posix.join("member-imports", request.file.filename);
  let job;
  try {
    job = await prisma.$transaction(async (transaction) => {
      const file = await transaction.storedFile.create({
        data: {
          category: "MEMBER_IMPORT",
          originalName: path.basename(request.file!.originalname),
          storedName: request.file!.filename,
          mimeType: request.file!.mimetype,
          sizeBytes: request.file!.size,
          storagePath,
          downloadPath: `/api/files/${request.file!.filename}`,
          uploadedById: currentUser.id,
        },
      });
      return transaction.importJob.create({ data: { type: "MEMBER_BULK", checksum, fileId: file.id, uploadedById: currentUser.id, status: "PROCESSING", startedAt: new Date() } });
    });
  } catch (error) {
    await removeFile(request.file.path);
    response.status(400).json({ success: false, message: error instanceof Error ? error.message : "The member import job could not be created" });
    return;
  }

  const jobId = job.id;
  const originalName = path.basename(request.file.originalname);
  // Staging can involve up to MAX_ROWS = 300,000 rows; run it on a worker_thread so the CPU-bound
  // parse doesn't block the main thread's event loop for the whole server (see report20.worker.ts
  // for the full rationale — this is the same fix applied to the same class of problem).
  const memberImportWorkerData: MemberImportWorkerData = {
    importJobId: jobId,
    filePath: request.file.path,
    mimeType: request.file.mimetype,
    originalName,
    actorUser: currentUser,
    auditContext: { ip: request.ip, userAgent: request.get("user-agent") },
  };
  spawnWorker(import.meta.url, "member-import.worker", memberImportWorkerData, (error) =>
    logger.error({ err: error, importJobId: jobId }, "Unhandled error while staging member import job"),
  );

  const pendingJob = await prisma.importJob.findUnique({ where: { id: jobId }, include: { file: { select: { originalName: true, downloadPath: true } } } });
  response.status(202).json({ success: true, data: pendingJob });
});

memberImportRouter.get("/members/:id", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid import ID" });
    return;
  }
  const job = await prisma.importJob.findFirst({ where: { id: params.data.id, type: "MEMBER_BULK", ...jobScope(user(response)) }, include: { file: { select: { originalName: true, downloadPath: true, sizeBytes: true } }, uploadedBy: { select: { id: true, fullName: true } } } });
  if (!job) {
    response.status(404).json({ success: false, message: "Member import not found" });
    return;
  }
  response.json({ success: true, data: job });
});

memberImportRouter.get("/members/:id/rows", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  const query = rowQuerySchema.safeParse(request.query);
  if (!params.success || !query.success) {
    response.status(400).json({ success: false, message: "Invalid request" });
    return;
  }
  const job = await prisma.importJob.findFirst({ where: { id: params.data.id, type: "MEMBER_BULK", ...jobScope(user(response)) }, select: { id: true } });
  if (!job) {
    response.status(404).json({ success: false, message: "Member import not found" });
    return;
  }
  const { page, limit, status } = query.data;
  const where = { importJobId: job.id, ...(status ? { status } : {}) };
  const [rows, total] = await prisma.$transaction([
    prisma.memberBulkImportRow.findMany({ where, orderBy: { rowNumber: "asc" }, skip: (page - 1) * limit, take: limit }),
    prisma.memberBulkImportRow.count({ where }),
  ]);
  response.json({ success: true, data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

memberImportRouter.post("/members/:id/commit", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid import ID" });
    return;
  }
  const currentUser = user(response);
  const job = await prisma.importJob.findFirst({ where: { id: params.data.id, type: "MEMBER_BULK", status: "COMPLETED", ...jobScope(currentUser) } });
  if (!job) {
    response.status(404).json({ success: false, message: "Validated member import not found" });
    return;
  }
  const jobId = job.id;
  const readyCount = await prisma.memberBulkImportRow.count({ where: { importJobId: jobId, status: "READY" } });
  await prisma.importJob.update({ where: { id: jobId }, data: { status: "PROCESSING", startedAt: new Date(), totalRows: readyCount, processedRows: 0 } });

  // Committing can mean creating up to MAX_ROWS members one at a time; run it off the request/response
  // cycle for the same reason staging and Report 20 reconciliation do (see stageMemberImport above).
  // Each row needs its own nested spouse/beneficiary creates, so unlike Report 20's flat auto-enroll
  // this can't be batched with createManyAndReturn — but progress is still reported periodically so
  // a long commit isn't a silent black box.
  const PROGRESS_EVERY = 200;
  void (async () => {
    const rows = await prisma.memberBulkImportRow.findMany({ where: { importJobId: jobId, status: "READY" }, orderBy: { rowNumber: "asc" } });
    let imported = 0;
    let failed = 0;
    let processed = 0;
    for (const row of rows) {
      const extra = bulkRawFields(row.rawData);
      try {
        const member = await prisma.$transaction(async (transaction) => {
          const created = await transaction.member.create({
            data: {
              controllerId: row.controllerId!, fullName: row.fullName!, school: row.school!, districtId: row.districtId!, dateOfBirth: row.dateOfBirth, ghanaCardId: row.ghanaCardId, phone: row.phone, report20Matched: row.report20Matched, status: "PENDING", createdById: currentUser.id,
              ...(extra.spouseName ? { spouseDeclarationStatus: "HAS_SPOUSE", spouse: { create: { fullName: extra.spouseName, dateOfBirth: optionalDate(extra.spouseDateOfBirth), ghanaCardId: extra.spouseGhanaCardId } } } : {}),
              beneficiaries: { create: { fullName: extra.beneficiaryName!, relationship: extra.beneficiaryRelationship!, dateOfBirth: optionalDate(extra.beneficiaryDateOfBirth), trusteeName: extra.trusteeName, trusteeGhanaCardId: extra.trusteeGhanaCardId } },
            },
          });
          await transaction.memberBulkImportRow.update({ where: { id: row.id }, data: { status: "IMPORTED", memberId: created.id } });
          return created;
        });
        imported += 1;
        await recordAudit({ request, actor: currentUser, action: "MEMBER_BULK_ENROLLED", entityType: "MEMBER", entityId: member.id, description: `Bulk enrolled ${member.fullName} (${member.controllerId})`, afterData: { importJobId: jobId, rowNumber: row.rowNumber, status: member.status }, districtId: member.districtId });
      } catch (error) {
        failed += 1;
        await prisma.memberBulkImportRow.update({ where: { id: row.id }, data: { status: "FAILED", issues: [error instanceof Error ? error.message.slice(0, 300) : "Enrollment failed"] } });
      }
      processed += 1;
      if (processed % PROGRESS_EVERY === 0) {
        await prisma.importJob.update({ where: { id: jobId }, data: { processedRows: processed } });
      }
    }
    const updated = await prisma.importJob.update({ where: { id: jobId }, data: { status: "COMPLETED", completedAt: new Date(), processedRows: processed, importedRows: { increment: imported }, readyRows: { decrement: imported + failed }, invalidRows: { increment: failed } } });
    await recordAudit({ request, actor: currentUser, action: "MEMBER_IMPORT_COMMITTED", entityType: "IMPORT_JOB", entityId: jobId, description: `Committed bulk member import ${jobId}`, afterData: { imported, failed, status: updated.status } });
  })().catch((error) => logger.error({ err: error, importJobId: jobId }, "Unhandled error while committing member import job"));

  const pendingJob = await prisma.importJob.findUnique({ where: { id: jobId } });
  response.status(202).json({ success: true, data: pendingJob });
});
