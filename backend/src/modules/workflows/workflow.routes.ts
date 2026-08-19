import { Router, type Response } from "express";

import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { authorizeRoles } from "../../middleware/authorize.js";
import { recordAudit } from "../audit/audit.service.js";
import { beneficiarySchema, spouseSchema } from "../members/member.schemas.js";
import { memberScope } from "../members/member.access.js";
import {
  changeRequestIdSchema,
  changeRequestQuerySchema,
  createChangeRequestSchema,
  memberDetailsChangeSchema,
  removalSchema,
  reviewChangeRequestSchema,
  workflowMemberParamsSchema,
  workflowNoteSchema,
} from "./workflow.schemas.js";

export const memberWorkflowRouter = Router();
export const changeRequestRouter = Router();

function user(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function accessibleMember(id: number, currentUser: AuthenticatedUser) {
  return prisma.member.findFirst({
    where: { id, ...memberScope(currentUser) },
    include: { district: { select: { regionId: true } }, beneficiaries: true },
  });
}

async function ghanaCardConflict(ghanaCardId: string | null | undefined, memberId: number, spouseId?: number) {
  if (!ghanaCardId) return false;
  const [member, spouse] = await Promise.all([
    prisma.member.findFirst({ where: { ghanaCardId, id: { not: memberId } }, select: { id: true } }),
    prisma.spouse.findFirst({ where: { ghanaCardId, ...(spouseId ? { id: { not: spouseId } } : {}) }, select: { id: true } }),
  ]);
  return Boolean(member || spouse);
}

memberWorkflowRouter.use(authenticate);

memberWorkflowRouter.get("/:id/workflow", async (request, response) => {
  const params = workflowMemberParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid member ID" });
    return;
  }
  const member = await accessibleMember(params.data.id, user(response));
  if (!member) {
    response.status(404).json({ success: false, message: "Member not found" });
    return;
  }
  const events = await prisma.memberWorkflowEvent.findMany({
    where: { memberId: member.id },
    include: { performedBy: { select: { id: true, fullName: true, role: true } } },
    orderBy: { createdAt: "desc" },
  });
  response.json({ success: true, data: events });
});

memberWorkflowRouter.post("/:id/approve", authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"), async (request, response) => {
  const params = workflowMemberParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid member ID" });
    return;
  }
  const actor = user(response);
  const existing = await accessibleMember(params.data.id, actor);
  if (!existing) {
    response.status(404).json({ success: false, message: "Member not found" });
    return;
  }
  if (!(["PENDING", "RETURNED"] as const).includes(existing.status as "PENDING" | "RETURNED")) {
    response.status(409).json({ success: false, message: "Only pending or returned members can be approved" });
    return;
  }
  const toStatus = existing.report20Matched ? "ACTIVE" : "FLAGGED";
  const [member, event] = await prisma.$transaction([
    prisma.member.update({ where: { id: existing.id }, data: { status: toStatus } }),
    prisma.memberWorkflowEvent.create({ data: { memberId: existing.id, action: "APPROVED", fromStatus: existing.status, toStatus, performedById: actor.id } }),
  ]);
  await recordAudit({ request, actor, action: "MEMBER_APPROVED", entityType: "MEMBER", entityId: member.id, description: `Approved ${member.fullName}`, beforeData: { status: existing.status }, afterData: { status: member.status, workflowEventId: event.id }, regionId: existing.district.regionId, districtId: existing.districtId });
  response.json({ success: true, data: { member, event } });
});

memberWorkflowRouter.post("/:id/return", authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"), async (request, response) => {
  const params = workflowMemberParamsSchema.safeParse(request.params);
  const body = workflowNoteSchema.safeParse(request.body);
  if (!params.success || !body.success) {
    response.status(400).json({ success: false, message: "A valid member ID and return note are required" });
    return;
  }
  const actor = user(response);
  const existing = await accessibleMember(params.data.id, actor);
  if (!existing) {
    response.status(404).json({ success: false, message: "Member not found" });
    return;
  }
  if (!(["PENDING", "FLAGGED"] as const).includes(existing.status as "PENDING" | "FLAGGED")) {
    response.status(409).json({ success: false, message: "Only pending or flagged members can be returned" });
    return;
  }
  const [member, event] = await prisma.$transaction([
    prisma.member.update({ where: { id: existing.id }, data: { status: "RETURNED" } }),
    prisma.memberWorkflowEvent.create({ data: { memberId: existing.id, action: "RETURNED", fromStatus: existing.status, toStatus: "RETURNED", note: body.data.note, performedById: actor.id } }),
  ]);
  await recordAudit({ request, actor, action: "MEMBER_RETURNED", entityType: "MEMBER", entityId: member.id, description: `Returned ${member.fullName} for correction`, beforeData: { status: existing.status }, afterData: { status: member.status, note: body.data.note, workflowEventId: event.id }, regionId: existing.district.regionId, districtId: existing.districtId });
  response.json({ success: true, data: { member, event } });
});

memberWorkflowRouter.post("/:id/remove", authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"), async (request, response) => {
  const params = workflowMemberParamsSchema.safeParse(request.params);
  const body = removalSchema.safeParse(request.body);
  if (!params.success || !body.success) {
    response.status(400).json({ success: false, message: "A valid removal reason is required" });
    return;
  }
  const actor = user(response);
  const existing = await accessibleMember(params.data.id, actor);
  if (!existing) {
    response.status(404).json({ success: false, message: "Member not found" });
    return;
  }
  if (existing.status === "REMOVED") {
    response.status(409).json({ success: false, message: "Member is already removed" });
    return;
  }
  const result = await prisma.$transaction(async (transaction) => {
    const member = await transaction.member.update({ where: { id: existing.id }, data: { status: "REMOVED" } });
    const event = await transaction.memberWorkflowEvent.create({ data: { memberId: existing.id, action: "REMOVED", fromStatus: existing.status, toStatus: "REMOVED", reason: body.data.reason, note: body.data.note, performedById: actor.id } });
    const claim = body.data.reason === "DEATH" || body.data.reason === "DISABILITY"
      ? await transaction.externalClaimSubmission.create({ data: { memberId: existing.id, submittedById: actor.id, idempotencyKey: `removal:${event.id}`, status: "PENDING" } })
      : null;
    return { member, event, claim };
  });
  await recordAudit({ request, actor, action: "MEMBER_REMOVED", entityType: "MEMBER", entityId: result.member.id, description: `Removed ${result.member.fullName}: ${body.data.reason}`, beforeData: { status: existing.status }, afterData: { status: result.member.status, reason: body.data.reason, workflowEventId: result.event.id, claimSubmissionId: result.claim?.id }, regionId: existing.district.regionId, districtId: existing.districtId });
  response.json({ success: true, data: result });
});

changeRequestRouter.use(authenticate);

changeRequestRouter.get("/", async (request, response) => {
  const query = changeRequestQuerySchema.safeParse(request.query);
  if (!query.success) {
    response.status(400).json({ success: false, message: "Invalid query" });
    return;
  }
  const { page, limit, status, type } = query.data;
  const where = { member: { is: memberScope(user(response)) }, ...(status ? { status } : {}), ...(type ? { type } : {}) };
  const [items, total] = await prisma.$transaction([
    prisma.memberChangeRequest.findMany({ where, include: { member: { select: { id: true, controllerId: true, fullName: true, status: true } }, requestedBy: { select: { id: true, fullName: true } }, reviewedBy: { select: { id: true, fullName: true } } }, orderBy: { requestedAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.memberChangeRequest.count({ where }),
  ]);
  response.json({ success: true, data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

changeRequestRouter.post("/members/:id", async (request, response) => {
  const params = workflowMemberParamsSchema.safeParse(request.params);
  const body = createChangeRequestSchema.safeParse(request.body);
  if (!params.success || !body.success) {
    response.status(400).json({ success: false, message: "Invalid change request", errors: body.success ? undefined : body.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
    return;
  }
  const actor = user(response);
  const member = await accessibleMember(params.data.id, actor);
  if (!member) {
    response.status(404).json({ success: false, message: "Member not found" });
    return;
  }
  const targetId = "targetBeneficiaryId" in body.data ? body.data.targetBeneficiaryId : null;
  if (targetId && !member.beneficiaries.some((beneficiary) => beneficiary.id === targetId)) {
    response.status(404).json({ success: false, message: "Beneficiary not found" });
    return;
  }
  const duplicate = await prisma.memberChangeRequest.findFirst({ where: { memberId: member.id, type: body.data.type, targetBeneficiaryId: targetId, status: "PENDING" }, select: { id: true } });
  if (duplicate) {
    response.status(409).json({ success: false, message: "A matching change request is already pending", existingRequestId: duplicate.id });
    return;
  }
  const item = await prisma.memberChangeRequest.create({ data: { memberId: member.id, type: body.data.type, targetBeneficiaryId: targetId, proposedData: "proposedData" in body.data ? asJson(body.data.proposedData) : undefined, requestNote: body.data.requestNote, requestedById: actor.id } });
  await recordAudit({ request, actor, action: "MEMBER_CHANGE_REQUESTED", entityType: "MEMBER_CHANGE_REQUEST", entityId: item.id, description: `Requested ${item.type} change for ${member.fullName}`, afterData: { type: item.type, targetBeneficiaryId: item.targetBeneficiaryId }, regionId: member.district.regionId, districtId: member.districtId });
  response.status(201).json({ success: true, data: item });
});

changeRequestRouter.patch("/:id/review", authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"), async (request, response) => {
  const params = changeRequestIdSchema.safeParse(request.params);
  const body = reviewChangeRequestSchema.safeParse(request.body);
  if (!params.success || !body.success) {
    response.status(400).json({ success: false, message: "Invalid review request" });
    return;
  }
  const actor = user(response);
  const item = await prisma.memberChangeRequest.findFirst({ where: { id: params.data.id, status: "PENDING", member: { is: memberScope(actor) } }, include: { member: { include: { beneficiaries: true, district: { select: { regionId: true } } } } } });
  if (!item) {
    response.status(404).json({ success: false, message: "Pending change request not found" });
    return;
  }
  if (body.data.action === "APPROVE" && item.type === "MEMBER_DETAILS") {
    const data = memberDetailsChangeSchema.parse(item.proposedData);
    if (await ghanaCardConflict(data.ghanaCardId, item.memberId)) {
      response.status(409).json({ success: false, message: "The proposed Ghana Card ID is already in use" });
      return;
    }
  }
  if (body.data.action === "APPROVE" && item.type === "SPOUSE") {
    const data = spouseSchema.parse(item.proposedData);
    const spouse = await prisma.spouse.findUnique({ where: { memberId: item.memberId }, select: { id: true } });
    if (data.ghanaCardId === item.member.ghanaCardId || await ghanaCardConflict(data.ghanaCardId, item.memberId, spouse?.id)) {
      response.status(409).json({ success: false, message: "The proposed spouse Ghana Card ID is already in use" });
      return;
    }
  }
  if (body.data.action === "APPROVE" && item.type === "BENEFICIARY_ADD" && item.member.beneficiaries.length >= 10) {
    response.status(409).json({ success: false, message: "A member cannot have more than 10 beneficiaries" });
    return;
  }
  if (body.data.action === "APPROVE") {
    await prisma.$transaction(async (transaction) => {
      if (item.type === "MEMBER_DETAILS") await transaction.member.update({ where: { id: item.memberId }, data: memberDetailsChangeSchema.parse(item.proposedData) });
      if (item.type === "SPOUSE") {
        const data = spouseSchema.parse(item.proposedData);
        await transaction.spouse.upsert({ where: { memberId: item.memberId }, update: data, create: { ...data, memberId: item.memberId } });
      }
      if (item.type === "BENEFICIARY_ADD") await transaction.beneficiary.create({ data: { ...beneficiarySchema.parse(item.proposedData), memberId: item.memberId } });
      if (item.type === "BENEFICIARY_UPDATE") await transaction.beneficiary.update({ where: { id: item.targetBeneficiaryId! }, data: beneficiarySchema.parse(item.proposedData) });
      if (item.type === "BENEFICIARY_REMOVE") {
        if (item.member.beneficiaries.length <= 1) throw new Error("A member must retain at least one beneficiary");
        await transaction.beneficiary.delete({ where: { id: item.targetBeneficiaryId! } });
      }
      await transaction.memberChangeRequest.update({ where: { id: item.id }, data: { status: "APPROVED", reviewedById: actor.id, reviewNote: body.data.note, reviewedAt: new Date() } });
    });
  } else {
    await prisma.memberChangeRequest.update({ where: { id: item.id }, data: { status: body.data.action === "RETURN" ? "RETURNED" : "REJECTED", reviewedById: actor.id, reviewNote: body.data.note, reviewedAt: new Date() } });
  }
  const reviewed = await prisma.memberChangeRequest.findUnique({ where: { id: item.id } });
  await recordAudit({ request, actor, action: `MEMBER_CHANGE_${reviewed!.status}`, entityType: "MEMBER_CHANGE_REQUEST", entityId: item.id, description: `${reviewed!.status} ${item.type} change for ${item.member.fullName}`, afterData: { status: reviewed!.status, reviewNote: reviewed!.reviewNote }, regionId: item.member.district.regionId, districtId: item.member.districtId });
  response.json({ success: true, data: reviewed });
});
