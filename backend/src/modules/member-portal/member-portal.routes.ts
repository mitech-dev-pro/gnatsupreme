import { Router, type Response } from "express";
import { z } from "zod";

import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { authenticateMember, type AuthenticatedMember } from "../../middleware/authenticate-member.js";
import { recordAudit } from "../audit/audit.service.js";
import { createChangeRequestSchema } from "../workflows/workflow.schemas.js";
import { notifyStaffForMember } from "../notifications/notification.service.js";
import { getOrganizationSettings, publicBranding } from "../settings/settings.service.js";

export const memberPortalRouter = Router();

function member(response: Response) {
  return response.locals.member as AuthenticatedMember;
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

memberPortalRouter.use(authenticateMember);

memberPortalRouter.get("/settings", async (_request, response) => {
  const settings = await getOrganizationSettings();
  response.json({ success: true, data: { ...publicBranding(settings), address: settings.address, privacyNotice: settings.privacyNotice } });
});

memberPortalRouter.get("/profile", async (_request, response) => {
  const currentMember = member(response);
  const [profile, benefitPlan] = await Promise.all([
    prisma.member.findUnique({
      where: { id: currentMember.id },
      select: {
        id: true,
        controllerId: true,
        fullName: true,
        dateOfBirth: true,
        ghanaCardId: true,
        phone: true,
        phoneVerifiedAt: true,
        school: true,
        status: true,
        report20Matched: true,
        district: { select: { id: true, name: true, region: { select: { id: true, name: true } } } },
        spouse: true,
        beneficiaries: { orderBy: { id: "asc" } },
      },
    }),
    prisma.benefitPlanVersion.findFirst({ where: { effectiveFrom: { lte: new Date() } }, include: { benefits: { orderBy: { type: "asc" } } }, orderBy: { effectiveFrom: "desc" } }),
  ]);
  response.json({ success: true, data: { member: profile, benefitPlan } });
});

memberPortalRouter.get("/claims", async (_request, response) => {
  const claims = await prisma.externalClaimSubmission.findMany({
    where: { memberId: member(response).id },
    select: { id: true, provider: true, externalClaimId: true, formUrl: true, status: true, errorMessage: true, submittedAt: true, lastSyncedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  response.json({ success: true, data: claims });
});

memberPortalRouter.get("/change-requests", async (_request, response) => {
  const requests = await prisma.memberChangeRequest.findMany({
    where: { memberId: member(response).id },
    select: { id: true, type: true, status: true, targetBeneficiaryId: true, proposedData: true, requestNote: true, reviewNote: true, requestedAt: true, reviewedAt: true },
    orderBy: { requestedAt: "desc" },
  });
  response.json({ success: true, data: requests });
});

memberPortalRouter.post("/change-requests", async (request, response) => {
  const parsed = createChangeRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ success: false, message: "Invalid change request", errors: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
    return;
  }
  const currentMember = member(response);
  const targetId = "targetBeneficiaryId" in parsed.data ? parsed.data.targetBeneficiaryId : null;
  if (targetId) {
    const target = await prisma.beneficiary.findFirst({ where: { id: targetId, memberId: currentMember.id }, select: { id: true } });
    if (!target) {
      response.status(404).json({ success: false, message: "Beneficiary not found" });
      return;
    }
  }
  const duplicate = await prisma.memberChangeRequest.findFirst({ where: { memberId: currentMember.id, type: parsed.data.type, targetBeneficiaryId: targetId, status: "PENDING" }, select: { id: true } });
  if (duplicate) {
    response.status(409).json({ success: false, message: "A matching change request is already pending", existingRequestId: duplicate.id });
    return;
  }
  const item = await prisma.memberChangeRequest.create({
    data: {
      memberId: currentMember.id,
      type: parsed.data.type,
      targetBeneficiaryId: targetId,
      proposedData: "proposedData" in parsed.data ? asJson(parsed.data.proposedData) : undefined,
      requestNote: parsed.data.requestNote,
    },
  });
  await recordAudit({ request, action: "MEMBER_SELF_SERVICE_CHANGE_REQUESTED", entityType: "MEMBER_CHANGE_REQUEST", entityId: item.id, description: `Member ${currentMember.controllerId} requested a ${item.type} change`, afterData: { memberId: currentMember.id, type: item.type } });
  await notifyStaffForMember({ memberId: currentMember.id, type: "MEMBER_CHANGE_REQUESTED", title: "Member change request", message: `${currentMember.fullName} submitted a ${item.type.toLowerCase().replaceAll("_", " ")} request for review.`, idempotencyKey: `change-request:${item.id}` });
  response.status(201).json({ success: true, data: item });
});

memberPortalRouter.patch("/change-requests/:id/cancel", async (request, response) => {
  const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid change request ID" });
    return;
  }

  const currentMember = member(response);
  const item = await prisma.memberChangeRequest.findFirst({
    where: { id: params.data.id, memberId: currentMember.id },
    select: { id: true, type: true, status: true },
  });
  if (!item) {
    response.status(404).json({ success: false, message: "Change request not found" });
    return;
  }
  if (item.status !== "PENDING") {
    response.status(409).json({ success: false, message: "Only pending requests can be cancelled" });
    return;
  }

  const updated = await prisma.memberChangeRequest.updateMany({
    where: { id: item.id, memberId: currentMember.id, status: "PENDING" },
    data: { status: "CANCELLED", reviewedAt: new Date() },
  });
  if (updated.count === 0) {
    response.status(409).json({ success: false, message: "This request is no longer pending" });
    return;
  }

  await recordAudit({
    request,
    action: "MEMBER_SELF_SERVICE_CHANGE_CANCELLED",
    entityType: "MEMBER_CHANGE_REQUEST",
    entityId: item.id,
    description: `Member ${currentMember.controllerId} cancelled a ${item.type} change request`,
    beforeData: item,
    afterData: { ...item, status: "CANCELLED" },
  });
  response.json({ success: true, data: { id: item.id, status: "CANCELLED" } });
});
