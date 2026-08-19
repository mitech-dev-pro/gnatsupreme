import { Router, type Response } from "express";
import type { ZodError } from "zod";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { authorizeRoles } from "../../middleware/authorize.js";
import { recordAudit } from "../audit/audit.service.js";
import { memberScope } from "../members/member.access.js";
import {
  cancelTransferSchema,
  createTransferSchema,
  reviewTransferSchema,
  transferIdParamsSchema,
  transferQuerySchema,
} from "./transfer.schemas.js";

export const transferRouter = Router();

const transferInclude = {
  member: { select: { id: true, controllerId: true, fullName: true, school: true, status: true } },
  fromDistrict: { include: { region: { select: { id: true, name: true } } } },
  toDistrict: { include: { region: { select: { id: true, name: true } } } },
  requestedBy: { select: { id: true, fullName: true } },
  reviewedBy: { select: { id: true, fullName: true } },
} as const;

class TransferConflict extends Error {}

function currentUser(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

function validationFailure(response: Response, error: ZodError) {
  response.status(400).json({
    success: false,
    message: "Invalid request",
    errors: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
  });
}

function transferScope(user: AuthenticatedUser) {
  if (user.role === "REGIONAL_ADMIN") {
    return {
      OR: [
        { fromDistrict: { regionId: user.regionId ?? -1 } },
        { toDistrict: { regionId: user.regionId ?? -1 } },
      ],
    };
  }
  if (user.role === "DISTRICT_ADMIN") {
    return {
      OR: [
        { fromDistrictId: user.districtId ?? -1 },
        { toDistrictId: user.districtId ?? -1 },
      ],
    };
  }
  return {};
}

async function accessibleTransfer(id: number, user: AuthenticatedUser) {
  return prisma.memberTransfer.findFirst({
    where: { id, ...transferScope(user) },
    include: transferInclude,
  });
}

transferRouter.use(authenticate);

transferRouter.get("/", async (request, response) => {
  const query = transferQuerySchema.safeParse(request.query);
  if (!query.success) return validationFailure(response, query.error);
  const user = currentUser(response);
  const { page, limit, status, search } = query.data;
  const where = {
    ...transferScope(user),
    ...(status ? { status } : {}),
    ...(search
      ? {
          member: {
            is: {
              OR: [
                { fullName: { contains: search, mode: "insensitive" as const } },
                { controllerId: { contains: search } },
              ],
            },
          },
        }
      : {}),
  };
  const [transfers, total] = await prisma.$transaction([
    prisma.memberTransfer.findMany({
      where,
      include: transferInclude,
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.memberTransfer.count({ where }),
  ]);
  response.json({
    success: true,
    data: transfers,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

transferRouter.get("/:id", async (request, response) => {
  const params = transferIdParamsSchema.safeParse(request.params);
  if (!params.success) return validationFailure(response, params.error);
  const transfer = await accessibleTransfer(params.data.id, currentUser(response));
  if (!transfer) {
    response.status(404).json({ success: false, message: "Transfer not found" });
    return;
  }
  response.json({ success: true, data: transfer });
});

transferRouter.post("/", async (request, response) => {
  const parsed = createTransferSchema.safeParse(request.body);
  if (!parsed.success) return validationFailure(response, parsed.error);
  const user = currentUser(response);
  const member = await prisma.member.findFirst({
    where: { id: parsed.data.memberId, ...memberScope(user) },
    include: { district: { include: { region: true } } },
  });
  if (!member) {
    response.status(404).json({ success: false, message: "Member not found" });
    return;
  }
  if (member.status === "REMOVED") {
    response.status(409).json({ success: false, message: "A removed member cannot be transferred" });
    return;
  }
  if (member.districtId === parsed.data.toDistrictId) {
    response.status(400).json({ success: false, message: "Destination must differ from the current district" });
    return;
  }
  const destination = await prisma.district.findUnique({
    where: { id: parsed.data.toDistrictId },
    include: { region: true },
  });
  if (!destination) {
    response.status(400).json({ success: false, message: "Destination district does not exist" });
    return;
  }
  const pending = await prisma.memberTransfer.findUnique({
    where: { activeKey: `member:${member.id}` },
  });
  if (pending) {
    response.status(409).json({ success: false, message: "This member already has a pending transfer" });
    return;
  }

  try {
    const transfer = await prisma.memberTransfer.create({
      data: {
        memberId: member.id,
        fromDistrictId: member.districtId,
        toDistrictId: destination.id,
        requestedById: user.id,
        activeKey: `member:${member.id}`,
        reason: parsed.data.reason,
      },
      include: transferInclude,
    });
    await recordAudit({
      request,
      actor: user,
      action: "TRANSFER_REQUESTED",
      entityType: "MEMBER_TRANSFER",
      entityId: transfer.id,
      description: `Requested transfer for ${member.fullName} from ${member.district.name} to ${destination.name}`,
      afterData: {
        memberId: member.id,
        fromDistrictId: member.districtId,
        toDistrictId: destination.id,
        reason: parsed.data.reason,
        status: transfer.status,
      },
      regionId: member.district.regionId,
      districtId: member.districtId,
    });
    response.status(201).json({ success: true, data: transfer });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      response.status(409).json({ success: false, message: "This member already has a pending transfer" });
      return;
    }
    throw error;
  }
});

transferRouter.patch(
  "/:id/review",
  authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"),
  async (request, response) => {
    const params = transferIdParamsSchema.safeParse(request.params);
    const body = reviewTransferSchema.safeParse(request.body);
    if (!params.success) return validationFailure(response, params.error);
    if (!body.success) return validationFailure(response, body.error);

    const user = currentUser(response);
    const existing = await accessibleTransfer(params.data.id, user);
    if (!existing) {
      response.status(404).json({ success: false, message: "Transfer not found" });
      return;
    }
    if (existing.status !== "PENDING") {
      response.status(409).json({ success: false, message: "Only pending transfers can be reviewed" });
      return;
    }

    try {
      const transfer = await prisma.$transaction(async (transaction) => {
        const now = new Date();
        const updated = await transaction.memberTransfer.updateMany({
          where: { id: existing.id, status: "PENDING", activeKey: `member:${existing.memberId}` },
          data: {
            status: body.data.decision,
            activeKey: null,
            reviewNote: body.data.reviewNote,
            reviewedById: user.id,
            reviewedAt: now,
            effectiveAt: body.data.decision === "APPROVED" ? now : null,
          },
        });
        if (updated.count !== 1) throw new TransferConflict("Transfer was already reviewed");

        if (body.data.decision === "APPROVED") {
          const moved = await transaction.member.updateMany({
            where: { id: existing.memberId, districtId: existing.fromDistrictId },
            data: { districtId: existing.toDistrictId },
          });
          if (moved.count !== 1) {
            throw new TransferConflict("Member is no longer in the source district");
          }
        }

        return transaction.memberTransfer.findUniqueOrThrow({
          where: { id: existing.id },
          include: transferInclude,
        });
      });

      await recordAudit({
        request,
        actor: user,
        action: body.data.decision === "APPROVED" ? "TRANSFER_APPROVED" : "TRANSFER_REJECTED",
        entityType: "MEMBER_TRANSFER",
        entityId: transfer.id,
        description: `${body.data.decision === "APPROVED" ? "Approved" : "Rejected"} transfer for ${transfer.member.fullName}`,
        beforeData: { status: existing.status, districtId: existing.fromDistrictId },
        afterData: {
          status: transfer.status,
          districtId: body.data.decision === "APPROVED" ? transfer.toDistrictId : transfer.fromDistrictId,
          reviewNote: transfer.reviewNote,
        },
        regionId: transfer.toDistrict.regionId,
        districtId: transfer.toDistrictId,
      });
      response.json({ success: true, data: transfer });
    } catch (error) {
      if (error instanceof TransferConflict) {
        response.status(409).json({ success: false, message: error.message });
        return;
      }
      throw error;
    }
  },
);

transferRouter.patch("/:id/cancel", async (request, response) => {
  const params = transferIdParamsSchema.safeParse(request.params);
  const body = cancelTransferSchema.safeParse(request.body);
  if (!params.success) return validationFailure(response, params.error);
  if (!body.success) return validationFailure(response, body.error);
  const user = currentUser(response);
  const existing = await accessibleTransfer(params.data.id, user);
  if (!existing) {
    response.status(404).json({ success: false, message: "Transfer not found" });
    return;
  }
  const canCancel =
    existing.requestedById === user.id || user.role === "SUPER_ADMIN" || user.role === "NATIONAL_ADMIN";
  if (!canCancel) {
    response.status(403).json({ success: false, message: "You cannot cancel this transfer" });
    return;
  }
  const updated = await prisma.memberTransfer.updateMany({
    where: { id: existing.id, status: "PENDING", activeKey: `member:${existing.memberId}` },
    data: {
      status: "CANCELLED",
      activeKey: null,
      reviewNote: body.data.note,
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
  });
  if (updated.count !== 1) {
    response.status(409).json({ success: false, message: "Only pending transfers can be cancelled" });
    return;
  }
  const transfer = await prisma.memberTransfer.findUniqueOrThrow({
    where: { id: existing.id },
    include: transferInclude,
  });
  await recordAudit({
    request,
    actor: user,
    action: "TRANSFER_CANCELLED",
    entityType: "MEMBER_TRANSFER",
    entityId: transfer.id,
    description: `Cancelled transfer for ${transfer.member.fullName}`,
    beforeData: { status: existing.status },
    afterData: { status: transfer.status, note: transfer.reviewNote },
    regionId: transfer.fromDistrict.regionId,
    districtId: transfer.fromDistrictId,
  });
  response.json({ success: true, data: transfer });
});
