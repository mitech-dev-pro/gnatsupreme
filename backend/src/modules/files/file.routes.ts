import { unlink } from "node:fs/promises";
import path from "node:path";

import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { memberScope } from "../members/member.access.js";
import { recordAudit } from "../audit/audit.service.js";
import { hasValidFileSignature, memberFileUpload, uploadRoot } from "./file.storage.js";

export const memberFileRouter = Router();
export const fileRouter = Router();

const memberParamsSchema = z.object({ memberId: z.coerce.number().int().positive() });
const fileParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const storedNameParamsSchema = z.object({
  storedName: z.string().regex(/^[0-9a-f-]{36}\.(pdf|jpg|png|webp|csv|xlsx)$/),
});
const categorySchema = z.enum(["MEMBER_DOCUMENT", "MARRIAGE_CERTIFICATE", "CLAIM_DOCUMENT", "OTHER"]);

function currentUser(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

async function requireMemberAccess(request: Request, response: Response, next: NextFunction) {
  const params = memberParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid member ID" });
    return;
  }
  const member = await prisma.member.findFirst({
    where: { id: params.data.memberId, ...memberScope(currentUser(response)) },
    include: {
      spouse: { select: { id: true } },
      district: { select: { regionId: true } },
    },
  });
  if (!member) {
    response.status(404).json({ success: false, message: "Member not found" });
    return;
  }
  response.locals.fileMember = member;
  next();
}

function receiveSingleFile(request: Request, response: Response, next: NextFunction) {
  memberFileUpload.single("file")(request, response, (error) => {
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

async function removeUploadedFile(filePath: string) {
  await unlink(filePath).catch(() => undefined);
}

function absoluteStoragePath(storagePath: string) {
  const absolutePath = path.resolve(uploadRoot, storagePath);
  const staysInsideRoot = absolutePath.startsWith(`${uploadRoot}${path.sep}`);
  return staysInsideRoot ? absolutePath : null;
}

memberFileRouter.use(authenticate);
fileRouter.use(authenticate);

memberFileRouter.get("/:memberId/files", requireMemberAccess, async (_request, response) => {
  const member = response.locals.fileMember as { id: number };
  const files = await prisma.storedFile.findMany({
    where: { memberId: member.id },
    select: {
      id: true,
      category: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      downloadPath: true,
      spouseId: true,
      uploadedBy: { select: { id: true, fullName: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  response.json({ success: true, data: files });
});

memberFileRouter.post(
  "/:memberId/files",
  requireMemberAccess,
  receiveSingleFile,
  async (request, response) => {
    if (!request.file) {
      response.status(400).json({ success: false, message: "Attach one file using the 'file' field" });
      return;
    }

    if (!(await hasValidFileSignature(request.file.path, request.file.mimetype))) {
      await removeUploadedFile(request.file.path);
      response.status(400).json({ success: false, message: "File content does not match its declared type" });
      return;
    }

    const category = categorySchema.safeParse(request.body.category ?? "MEMBER_DOCUMENT");
    const member = response.locals.fileMember as {
      id: number;
      districtId: number | null;
      district: { regionId: number } | null;
      spouse: { id: number } | null;
    };
    if (!category.success) {
      await removeUploadedFile(request.file.path);
      response.status(400).json({ success: false, message: "Invalid file category" });
      return;
    }
    if (category.data === "MARRIAGE_CERTIFICATE" && !member.spouse) {
      await removeUploadedFile(request.file.path);
      response.status(409).json({
        success: false,
        message: "Add the spouse before uploading a marriage certificate",
      });
      return;
    }

    const storagePath = path.posix.join("member-files", request.file.filename);
    const downloadPath = `/api/files/${request.file.filename}`;
    const slotKey =
      category.data === "CLAIM_DOCUMENT" && typeof request.body.slotKey === "string" && request.body.slotKey.trim()
        ? request.body.slotKey.trim().slice(0, 80)
        : null;

    try {
      const file = await prisma.storedFile.create({
        data: {
          category: category.data,
          originalName: path.basename(request.file.originalname),
          storedName: request.file.filename,
          mimeType: request.file.mimetype,
          sizeBytes: request.file.size,
          storagePath,
          downloadPath,
          memberId: member.id,
          spouseId: category.data === "MARRIAGE_CERTIFICATE" ? member.spouse?.id : null,
          uploadedById: currentUser(response).id,
          slotKey,
        },
        select: {
          id: true,
          category: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          downloadPath: true,
          createdAt: true,
          slotKey: true,
        },
      });
      await recordAudit({
        request,
        actor: currentUser(response),
        action: "FILE_UPLOADED",
        entityType: "STORED_FILE",
        entityId: file.id,
        description: `Uploaded ${file.originalName}`,
        afterData: {
          category: file.category,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        },
        regionId: member.district?.regionId,
        districtId: member.districtId,
      });
      response.status(201).json({ success: true, data: file });
    } catch (error) {
      await removeUploadedFile(request.file.path);
      throw error;
    }
  },
);

fileRouter.get("/:storedName", async (request, response) => {
  const params = storedNameParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid file name" });
    return;
  }
  const user = currentUser(response);
  const file = await prisma.storedFile.findUnique({
    where: { storedName: params.data.storedName },
    include: { member: { select: { districtId: true, district: { select: { regionId: true } } } } },
  });
  const elevated = user.role === "SUPER_ADMIN" || user.role === "NATIONAL_ADMIN";
  const accessible = file?.member
    ? elevated ||
      (user.role === "REGIONAL_ADMIN" && file.member.district?.regionId === user.regionId) ||
      (user.role === "DISTRICT_ADMIN" && file.member.districtId === user.districtId)
    : elevated;
  if (!file || !accessible) {
    response.status(404).json({ success: false, message: "File not found" });
    return;
  }
  const filePath = absoluteStoragePath(file.storagePath);
  if (!filePath) {
    response.status(500).json({ success: false, message: "Stored file path is invalid" });
    return;
  }
  response.type(file.mimeType);
  response.download(filePath, file.originalName, (error) => {
    if (error && !response.headersSent) {
      response.status(404).json({ success: false, message: "Stored file is missing" });
    }
  });
});

fileRouter.delete("/:id", async (request, response) => {
  const params = fileParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid file ID" });
    return;
  }
  const user = currentUser(response);
  const file = await prisma.storedFile.findUnique({
    where: { id: params.data.id },
    include: {
      member: { select: { districtId: true, district: { select: { regionId: true } } } },
      importJob: { select: { id: true } },
    },
  });
  const elevated = user.role === "SUPER_ADMIN" || user.role === "NATIONAL_ADMIN";
  const accessible = file?.member
    ? elevated ||
      (user.role === "REGIONAL_ADMIN" && file.member.district?.regionId === user.regionId) ||
      (user.role === "DISTRICT_ADMIN" && file.member.districtId === user.districtId)
    : elevated;
  if (!file || !accessible) {
    response.status(404).json({ success: false, message: "File not found" });
    return;
  }
  if (file.importJob) {
    response.status(409).json({ success: false, message: "Import source files cannot be deleted independently" });
    return;
  }
  if (file.uploadedById !== user.id && user.role !== "SUPER_ADMIN" && user.role !== "NATIONAL_ADMIN") {
    response.status(403).json({ success: false, message: "You cannot delete this file" });
    return;
  }

  const filePath = absoluteStoragePath(file.storagePath);
  if (filePath) await removeUploadedFile(filePath);
  await prisma.storedFile.delete({ where: { id: file.id } });
  await recordAudit({
    request,
    actor: user,
    action: "FILE_DELETED",
    entityType: "STORED_FILE",
    entityId: file.id,
    description: `Deleted ${file.originalName}`,
    beforeData: {
      category: file.category,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    },
    regionId: file.member?.district?.regionId,
    districtId: file.member?.districtId,
  });
  response.status(204).send();
});
