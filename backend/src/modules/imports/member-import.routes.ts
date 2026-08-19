import { unlink } from "node:fs/promises";
import path from "node:path";

import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { recordAudit } from "../audit/audit.service.js";
import { hasValidReport20Signature, memberImportFileUpload } from "../files/file.storage.js";
import { bulkRawFields, stageMemberImport } from "./member-import.service.js";
import { sha256File } from "./report20.service.js";

export const memberImportRouter = Router();
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const rowQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  status: z.enum(["READY", "INVALID", "DUPLICATE", "EXISTING", "OUT_OF_SCOPE", "IMPORTED", "FAILED"]).optional(),
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
  const duplicate = await prisma.importJob.findUnique({ where: { type_checksum: { type: "MEMBER_BULK", checksum } }, select: { id: true, status: true } });
  if (duplicate) {
    await removeFile(request.file.path);
    response.status(409).json({ success: false, message: "This exact member file has already been uploaded", duplicateImport: duplicate });
    return;
  }
  const currentUser = user(response);
  const storagePath = path.posix.join("member-imports", request.file.filename);
  let jobId: number;
  try {
    const job = await prisma.$transaction(async (transaction) => {
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
    jobId = job.id;
    await stageMemberImport(job.id, request.file.path, request.file.mimetype, currentUser);
  } catch (error) {
    if (typeof jobId! === "number") await prisma.importJob.update({ where: { id: jobId }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Validation failed", completedAt: new Date() } }).catch(() => undefined);
    else await removeFile(request.file.path);
    response.status(400).json({ success: false, message: error instanceof Error ? error.message : "The member file could not be validated", ...(typeof jobId! === "number" ? { importId: jobId } : {}) });
    return;
  }
  const job = await prisma.importJob.findUnique({ where: { id: jobId }, include: { file: { select: { originalName: true, downloadPath: true } } } });
  await recordAudit({ request, actor: currentUser, action: "MEMBER_IMPORT_VALIDATED", entityType: "IMPORT_JOB", entityId: jobId, description: `Validated bulk member import ${job?.file.originalName ?? jobId}`, afterData: job ? { totalRows: job.totalRows, readyRows: job.readyRows, invalidRows: job.invalidRows, duplicateRows: job.duplicateRows } : undefined });
  response.status(201).json({ success: true, data: job });
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
  const rows = await prisma.memberBulkImportRow.findMany({ where: { importJobId: job.id, status: "READY" }, orderBy: { rowNumber: "asc" } });
  let imported = 0;
  let failed = 0;
  for (const row of rows) {
    const extra = bulkRawFields(row.rawData);
    try {
      const member = await prisma.$transaction(async (transaction) => {
        const created = await transaction.member.create({
          data: {
            controllerId: row.controllerId!, fullName: row.fullName!, school: row.school!, districtId: row.districtId!, dateOfBirth: row.dateOfBirth, ghanaCardId: row.ghanaCardId, phone: row.phone, report20Matched: row.report20Matched, status: "PENDING", createdById: currentUser.id,
            ...(extra.spouseName ? { spouse: { create: { fullName: extra.spouseName, dateOfBirth: optionalDate(extra.spouseDateOfBirth), ghanaCardId: extra.spouseGhanaCardId } } } : {}),
            beneficiaries: { create: { fullName: extra.beneficiaryName!, relationship: extra.beneficiaryRelationship!, dateOfBirth: optionalDate(extra.beneficiaryDateOfBirth), trusteeName: extra.trusteeName, trusteeGhanaCardId: extra.trusteeGhanaCardId } },
          },
        });
        await transaction.memberBulkImportRow.update({ where: { id: row.id }, data: { status: "IMPORTED", memberId: created.id } });
        return created;
      });
      imported += 1;
      await recordAudit({ request, actor: currentUser, action: "MEMBER_BULK_ENROLLED", entityType: "MEMBER", entityId: member.id, description: `Bulk enrolled ${member.fullName} (${member.controllerId})`, afterData: { importJobId: job.id, rowNumber: row.rowNumber, status: member.status }, districtId: member.districtId });
    } catch (error) {
      failed += 1;
      await prisma.memberBulkImportRow.update({ where: { id: row.id }, data: { status: "FAILED", issues: [error instanceof Error ? error.message.slice(0, 300) : "Enrollment failed"] } });
    }
  }
  const updated = await prisma.importJob.update({ where: { id: job.id }, data: { importedRows: { increment: imported }, readyRows: { decrement: imported + failed }, invalidRows: { increment: failed } } });
  await recordAudit({ request, actor: currentUser, action: "MEMBER_IMPORT_COMMITTED", entityType: "IMPORT_JOB", entityId: job.id, description: `Committed bulk member import ${job.id}`, afterData: { imported, failed } });
  response.json({ success: true, data: { import: updated, imported, failed } });
});
