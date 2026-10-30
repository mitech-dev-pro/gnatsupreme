import { env } from "../../config/env.js";
import { writeMemberRecoveryWorkbook } from "./member-import.export.js";
import { claimMemberImport } from "./member-import.recovery.js";
import { unlink } from "node:fs/promises";
import path from "node:path";

import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";

import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { enqueueMemberImportJob } from "../../queues/import.queue.js";
import { isStaleImportJob } from "../../lib/stale-jobs.js";
import {
  hasValidReport20Signature,
  memberImportFileUpload,
  uploadRoot,
} from "../files/file.storage.js";
import { runMemberImportCommit } from "./member-import.commit.js";
import type { MemberImportWorkerData } from "./member-import.worker.js";
import { sha256File } from "./report20.service.js";

export const memberImportRouter = Router();
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const rowQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  status: z
    .enum(["READY", "INVALID", "DUPLICATE", "EXISTING", "OUT_OF_SCOPE", "IMPORTED", "FAILED"])
    .optional(),
});
const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
});
// The upload screen's "Staff type" selector, plus a required Region for a SUPER_ADMIN/
// NATIONAL_ADMIN uploading a non-teaching file (they have no fixed region) -- both persisted on
// ImportJob so a /rerun, which resumes the commit loop without re-uploading the file, still has
// access to them.
const uploadBodySchema = z.object({
  employmentCategory: z.enum(["TEACHING", "NON_TEACHING"]),
  regionId: z.coerce.number().int().positive().optional(),
});

function user(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

function receiveFile(request: Request, response: Response, next: NextFunction) {
  memberImportFileUpload.single("file")(request, response, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      response.status(413).json({
        success: false,
        message: `File exceeds the ${env.MAX_UPLOAD_SIZE_MB} MB upload limit`,
      });
      return;
    }
    response
      .status(400)
      .json({ success: false, message: error instanceof Error ? error.message : "Upload failed" });
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

memberImportRouter.use(authenticate);

memberImportRouter.get("/members", async (request, response) => {
  const parsed = listSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ success: false, message: "Invalid query" });
    return;
  }
  const { page, limit, status } = parsed.data;
  const where = {
    type: "MEMBER_BULK" as const,
    ...jobScope(user(response)),
    ...(status ? { status } : {}),
  };
  const [jobs, total] = await Promise.all([
    prisma.importJob.findMany({
      where,
      include: {
        file: { select: { originalName: true, downloadPath: true, sizeBytes: true } },
        uploadedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.importJob.count({ where }),
  ]);
  response.json({
    success: true,
    data: jobs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

memberImportRouter.post("/members", receiveFile, async (request, response) => {
  if (!request.file) {
    response
      .status(400)
      .json({ success: false, message: "Attach one CSV or XLSX file using the 'file' field" });
    return;
  }
  const uploadOptions = uploadBodySchema.safeParse(request.body);
  if (!uploadOptions.success) {
    await removeFile(request.file.path);
    response.status(400).json({
      success: false,
      message: "Choose whether this file contains teaching or non-teaching staff",
    });
    return;
  }
  if (
    uploadOptions.data.employmentCategory === "NON_TEACHING" &&
    !uploadOptions.data.regionId &&
    (user(response).role === "SUPER_ADMIN" || user(response).role === "NATIONAL_ADMIN")
  ) {
    await removeFile(request.file.path);
    response
      .status(400)
      .json({ success: false, message: "Select the region these non-teaching staff belong to" });
    return;
  }
  if (!(await hasValidReport20Signature(request.file.path, request.file.mimetype))) {
    await removeFile(request.file.path);
    response
      .status(400)
      .json({ success: false, message: "File content does not match its declared type" });
    return;
  }
  const checksum = await sha256File(request.file.path);
  const duplicate = await prisma.importJob.findUnique({
    where: { type_checksum: { type: "MEMBER_BULK", checksum } },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      fileId: true,
      importedRows: true,
      uploadedById: true,
      file: { select: { storagePath: true } },
    },
  });
  if (duplicate) {
    await removeFile(request.file.path);
    const actor = user(response);
    const accessible =
      ["SUPER_ADMIN", "NATIONAL_ADMIN"].includes(actor.role) || duplicate.uploadedById === actor.id;
    response.status(409).json({
      success: false,
      message: accessible
        ? "This file already has an import. Open it to review progress, enroll ready rows or retry unfinished work."
        : "This file has already been uploaded. Contact a national administrator if you need access.",
      ...(accessible
        ? {
            duplicateImport: {
              id: duplicate.id,
              status: duplicate.status,
              importedRows: duplicate.importedRows,
            },
          }
        : {}),
    });
    return;
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
      return transaction.importJob.create({
        data: {
          type: "MEMBER_BULK",
          checksum,
          fileId: file.id,
          uploadedById: currentUser.id,
          status: "PROCESSING",
          startedAt: new Date(),
          defaultEmploymentCategory: uploadOptions.data.employmentCategory,
          defaultRegionId: uploadOptions.data.regionId,
        },
      });
    });
  } catch (error) {
    await removeFile(request.file.path);
    response.status(400).json({
      success: false,
      message:
        error instanceof Error ? error.message : "The member import job could not be created",
    });
    return;
  }

  const jobId = job.id;
  const originalName = path.basename(request.file.originalname);
  // Staging can involve up to MAX_ROWS = 300,000 rows; queue it onto the BullMQ "member-import"
  // queue, processed by the dedicated worker process (see ../../worker.ts) so the CPU-bound parse
  // never blocks the API server's event loop (see report20.worker.ts for the full rationale — this
  // is the same fix applied to the same class of problem).
  const memberImportWorkerData: MemberImportWorkerData = {
    importJobId: jobId,
    attemptStartedAt: job.startedAt!.toISOString(),
    filePath: request.file.path,
    mimeType: request.file.mimetype,
    originalName,
    actorUser: currentUser,
    auditContext: { ip: request.ip, userAgent: request.get("user-agent") },
  };
  try {
    await enqueueMemberImportJob(memberImportWorkerData);
  } catch (error) {
    logger.error({ err: error, importJobId: jobId }, "Could not queue member import job");
    await prisma.importJob.updateMany({
      where: { id: jobId, status: "PROCESSING", startedAt: job.startedAt },
      data: {
        status: "FAILED",
        errorMessage: "Could not queue this import for processing",
        completedAt: new Date(),
      },
    });
    response.status(503).json({
      success: false,
      message: "The import queue is unavailable. Your upload is saved; open it and retry later.",
      importId: jobId,
    });
    return;
  }

  const pendingJob = await prisma.importJob.findUnique({
    where: { id: jobId },
    include: { file: { select: { originalName: true, downloadPath: true } } },
  });
  response.status(202).json({ success: true, data: pendingJob });
});

memberImportRouter.get("/members/:id", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid import ID" });
    return;
  }
  const job = await prisma.importJob.findFirst({
    where: { id: params.data.id, type: "MEMBER_BULK", ...jobScope(user(response)) },
    include: {
      file: { select: { originalName: true, downloadPath: true, sizeBytes: true } },
      uploadedBy: { select: { id: true, fullName: true } },
    },
  });
  if (!job) {
    response.status(404).json({ success: false, message: "Member import not found" });
    return;
  }
  response.json({ success: true, data: job });
});

memberImportRouter.get("/members/:id/recovery-file", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid import ID" });
    return;
  }
  const job = await prisma.importJob.findFirst({
    where: { id: params.data.id, type: "MEMBER_BULK", ...jobScope(user(response)) },
    select: { id: true, status: true },
  });
  if (!job) {
    response.status(404).json({ success: false, message: "Member import not found" });
    return;
  }
  if (["PROCESSING", "PENDING"].includes(job.status)) {
    response.status(409).json({
      success: false,
      message: "Wait for processing to finish before downloading corrections.",
    });
    return;
  }
  await writeMemberRecoveryWorkbook(job.id, response);
});

memberImportRouter.get("/members/:id/rows", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  const query = rowQuerySchema.safeParse(request.query);
  if (!params.success || !query.success) {
    response.status(400).json({ success: false, message: "Invalid request" });
    return;
  }
  const job = await prisma.importJob.findFirst({
    where: { id: params.data.id, type: "MEMBER_BULK", ...jobScope(user(response)) },
    select: { id: true },
  });
  if (!job) {
    response.status(404).json({ success: false, message: "Member import not found" });
    return;
  }
  const { page, limit, status } = query.data;
  const where = { importJobId: job.id, ...(status ? { status } : {}) };
  const [rows, total] = await Promise.all([
    prisma.memberBulkImportRow.findMany({
      where,
      orderBy: { rowNumber: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.memberBulkImportRow.count({ where }),
  ]);
  response.json({
    success: true,
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// Committing can mean creating up to MAX_ROWS members one at a time; run it off the request/response
// cycle for the same reason staging and Report 20 reconciliation do (see stageMemberImport above).
// Each row needs its own nested spouse/beneficiary creates, so unlike Report 20's flat auto-enroll
// this can't be batched with createManyAndReturn — but progress is still reported periodically so
// a long commit isn't a silent black box.
//
// Naturally resumable: it only ever queries rows still in READY status, so if a previous attempt
// died partway through (see the /:id/rerun stale-job path below), already-IMPORTED/FAILED rows are
// skipped automatically — no row is ever re-processed. readyRows is set to the actual remaining
// READY count (always 0 once the loop finishes, since it processes every row it queried) rather
// than decremented by this run's count alone, so a resumed run converges on the correct total
// instead of leaving stale "still ready" rows from whatever a crashed earlier attempt didn't get
// to account for.

memberImportRouter.post("/members/:id/commit", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid import ID" });
    return;
  }
  const currentUser = user(response);
  const job = await prisma.importJob.findFirst({
    where: {
      id: params.data.id,
      type: "MEMBER_BULK",
      status: "COMPLETED",
      ...jobScope(currentUser),
    },
  });
  if (!job) {
    response.status(404).json({ success: false, message: "Validated member import not found" });
    return;
  }
  const jobId = job.id;
  const readyCount = await prisma.memberBulkImportRow.count({
    where: { importJobId: jobId, status: "READY" },
  });
  if (!readyCount) {
    response.status(409).json({
      success: false,
      message: "No ready rows remain. Refresh this import to see its outcomes.",
    });
    return;
  }
  const sourceTotal = await prisma.memberBulkImportRow.count({ where: { importJobId: jobId } });
  const startedAt = await claimMemberImport(job, sourceTotal, readyCount);
  void runMemberImportCommit(jobId, currentUser, request, startedAt);

  const pendingJob = await prisma.importJob.findUnique({
    where: { id: jobId },
    include: {
      file: { select: { originalName: true, sizeBytes: true } },
      uploadedBy: { select: { id: true, fullName: true } },
    },
  });
  response.status(202).json({ success: true, data: pendingJob });
});

// Recovers a job whose worker died mid-run (see lib/stale-jobs.ts) — same class of problem as
// Report 20's /:id/rerun. Which phase to resume is inferred from whether staging ever finished:
// no MemberBulkImportRow rows at all means it died during staging (stageMemberImport is one
// transaction, so nothing partial was left behind — safe to restart from scratch); rows already
// existing means staging completed and it died mid-commit, so resume the commit loop instead,
// which naturally picks up only rows still READY.
memberImportRouter.post("/members/:id/rerun", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid import ID" });
    return;
  }
  const currentUser = user(response);
  const job = await prisma.importJob.findFirst({
    where: { id: params.data.id, type: "MEMBER_BULK", ...jobScope(currentUser) },
    include: { file: { select: { originalName: true, storagePath: true, mimeType: true } } },
  });
  if (!job) {
    response.status(404).json({ success: false, message: "Member import not found" });
    return;
  }
  if (job.status !== "FAILED" && !isStaleImportJob(job)) {
    response.status(409).json({
      success: false,
      message:
        job.status === "PENDING" || job.status === "PROCESSING"
          ? "This import is still being processed"
          : "Only a failed or stalled import can be retried",
    });
    return;
  }

  const stagedRowCount = await prisma.memberBulkImportRow.count({ where: { importJobId: job.id } });
  const readyCount = stagedRowCount
    ? await prisma.memberBulkImportRow.count({ where: { importJobId: job.id, status: "READY" } })
    : 0;
  if (stagedRowCount && !readyCount) {
    response.status(409).json({
      success: false,
      message:
        "No unfinished ready rows remain. Download the correction workbook for rows needing changes.",
    });
    return;
  }
  const startedAt = await claimMemberImport(job, stagedRowCount, readyCount);
  if (stagedRowCount === 0) {
    const memberImportWorkerData: MemberImportWorkerData = {
      importJobId: job.id,
      attemptStartedAt: startedAt.toISOString(),
      filePath: path.join(uploadRoot, job.file.storagePath),
      mimeType: job.file.mimeType,
      originalName: job.file.originalName,
      actorUser: currentUser,
      auditContext: { ip: request.ip, userAgent: request.get("user-agent") },
    };
    try {
      await enqueueMemberImportJob(memberImportWorkerData);
    } catch (error) {
      logger.error({ err: error, importJobId: job.id }, "Could not queue member import retry");
      await prisma.importJob.updateMany({
        where: { id: job.id, status: "PROCESSING", startedAt },
        data: {
          status: "FAILED",
          errorMessage: "Could not queue this retry for processing",
          completedAt: new Date(),
        },
      });
      response
        .status(503)
        .json({ success: false, message: "The import queue is unavailable — try again shortly" });
      return;
    }
  } else {
    void runMemberImportCommit(job.id, currentUser, request, startedAt);
  }

  const pendingJob = await prisma.importJob.findUnique({
    where: { id: job.id },
    include: {
      file: { select: { originalName: true, downloadPath: true, sizeBytes: true } },
      uploadedBy: { select: { id: true, fullName: true } },
    },
  });
  response.status(202).json({ success: true, data: pendingJob });
});
