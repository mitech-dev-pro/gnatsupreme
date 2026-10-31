import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import type { AuthenticatedMember } from "../../middleware/authenticate-member.js";
import { recordAudit } from "../audit/audit.service.js";
import { createChangeRequestSchema } from "../workflows/workflow.schemas.js";
import { notifyChangeRequested } from "../workflows/change-request.notifications.js";

export const memberChangeCorrectionRouter = Router();
const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
const versionSchema = z.object({ expectedUpdatedAt: z.iso.datetime() });

memberChangeCorrectionRouter.patch("/:id/resubmit", async (request, response) => {
  const params = paramsSchema.safeParse(request.params);
  const version = versionSchema.safeParse(request.body);
  const body = createChangeRequestSchema.safeParse(request.body);
  if (!params.success || !version.success || !body.success) {
    response.status(400).json({
      success: false,
      message: "Check the corrected details and refresh the request if necessary.",
      errors: body.success
        ? undefined
        : body.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
    });
    return;
  }
  const actor = response.locals.member as AuthenticatedMember;
  const result = await prisma.$transaction(async (transaction) => {
    const original = await transaction.memberChangeRequest.findFirst({
      where: { id: params.data.id, memberId: actor.id },
    });
    if (!original) throw new AppError(404, "Change request not found");
    if (
      original.status !== "RETURNED" ||
      original.updatedAt.toISOString() !== version.data.expectedUpdatedAt
    )
      throw new AppError(
        409,
        "This request changed. Refresh it before correcting and resubmitting.",
      );
    const targetId = "targetBeneficiaryId" in body.data ? body.data.targetBeneficiaryId : null;
    if (original.type !== body.data.type || original.targetBeneficiaryId !== targetId)
      throw new AppError(
        400,
        "Keep the original request type and beneficiary when correcting a request.",
      );
    if (
      targetId &&
      !(await transaction.beneficiary.findFirst({
        where: { id: targetId, memberId: actor.id },
        select: { id: true },
      }))
    )
      throw new AppError(
        409,
        "This beneficiary is no longer on your record. Contact your GNAT office.",
      );
    const duplicate = await transaction.memberChangeRequest.findFirst({
      where: {
        memberId: actor.id,
        type: original.type,
        targetBeneficiaryId: targetId,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (duplicate)
      throw new AppError(
        409,
        "A matching request is already awaiting review. Check your pending requests.",
      );
    const updated = await transaction.memberChangeRequest.updateMany({
      where: {
        id: original.id,
        memberId: actor.id,
        status: "RETURNED",
        updatedAt: original.updatedAt,
      },
      data: {
        status: "PENDING",
        proposedData:
          "proposedData" in body.data
            ? (JSON.parse(JSON.stringify(body.data.proposedData)) as Prisma.InputJsonValue)
            : undefined,
        requestNote: body.data.requestNote || null,
        // Keep the previous review note visible while the corrected request awaits review.
      },
    });
    if (!updated.count)
      throw new AppError(409, "This request changed. Refresh it before resubmitting.");
    const item = await transaction.memberChangeRequest.findUniqueOrThrow({
      where: { id: original.id },
    });
    return { original, item };
  });
  await recordAudit({
    request,
    action: "MEMBER_SELF_SERVICE_CHANGE_RESUBMITTED",
    entityType: "MEMBER_CHANGE_REQUEST",
    entityId: result.item.id,
    description: `Member corrected and resubmitted request ${result.item.id}`,
    beforeData: {
      proposedData: result.original.proposedData,
      requestNote: result.original.requestNote,
      status: result.original.status,
      reviewNote: result.original.reviewNote,
    },
    afterData: {
      proposedData: result.item.proposedData,
      requestNote: result.item.requestNote,
      status: result.item.status,
    },
  });
  await notifyChangeRequested({ ...result.item, resubmitted: true });
  response.json({ success: true, data: result.item });
});
