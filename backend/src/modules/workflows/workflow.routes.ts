import { Router, type Response } from "express";

import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { authorizeRoles } from "../../middleware/authorize.js";
import { recordAudit } from "../audit/audit.service.js";
import { beneficiarySchema, spouseSchema } from "../members/member.schemas.js";
import { memberScope } from "../members/member.access.js";
import { notifyMember } from "../notifications/notification.service.js";
import {
  bulkApproveSchema,
  bulkReturnSchema,
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

memberWorkflowRouter.post("/:id/verify-phone", async (request, response) => {
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
  if (!existing.phone) {
    response.status(409).json({ success: false, message: "Add a phone number before verifying it" });
    return;
  }
  const member = await prisma.member.update({ where: { id: existing.id }, data: { phoneVerifiedAt: new Date() } });
  await recordAudit({ request, actor, action: "MEMBER_PHONE_VERIFIED", entityType: "MEMBER", entityId: member.id, description: `Verified the member phone number for ${member.fullName}`, afterData: { phoneVerifiedAt: member.phoneVerifiedAt }, regionId: existing.district.regionId, districtId: existing.districtId });
  await notifyMember({ memberId: member.id, type: "PHONE_VERIFIED", title: "Phone number verified", message: "Your phone number has been verified for GNAT Supreme Care member access.", idempotencyKey: `phone-verified:${member.id}:${member.phoneVerifiedAt!.getTime()}` });
  response.json({ success: true, data: { id: member.id, phoneVerifiedAt: member.phoneVerifiedAt } });
});

memberWorkflowRouter.post("/:id/check-report20", async (request, response) => {
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
  const latestImport = await prisma.importJob.findFirst({
    where: { type: "REPORT_20", status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, reportMonth: true, completedAt: true, file: { select: { originalName: true } } },
  });
  if (!latestImport) {
    response.json({ success: true, data: { matched: false, checkedImport: null, message: "No Report 20 file has been uploaded yet." } });
    return;
  }
  const row = await prisma.report20Row.findFirst({
    where: { importJobId: latestImport.id, controllerId: existing.controllerId },
    select: { status: true, issues: true },
  });
  // Only a clean MATCHED row counts — CHANGED means the row was found but its data disagrees with
  // what's on file, which still needs staff review (see the issues list) before it's a real match.
  const found = row?.status === "MATCHED";
  const checkedImport = { id: latestImport.id, fileName: latestImport.file.originalName, reportMonth: latestImport.reportMonth, completedAt: latestImport.completedAt };
  if (!found) {
    const issuesList = Array.isArray(row?.issues) ? (row!.issues as string[]) : [];
    response.json({
      success: true,
      data: {
        matched: false,
        checkedImport,
        rowStatus: row?.status ?? null,
        issues: row?.issues ?? null,
        message:
          row?.status === "CHANGED"
            ? `This member's Controller ID was found in the latest Report 20 file, but the data differs: ${issuesList.join(", ")}.`
            : row
              ? "This member's Controller ID appears in the latest Report 20 file, but the row itself needs attention before it can count as a match."
              : "This member's Controller ID was not found in the latest Report 20 file.",
      },
    });
    return;
  }
  if (existing.report20Matched) {
    response.json({ success: true, data: { matched: true, alreadyMatched: true, checkedImport } });
    return;
  }
  const member = await prisma.member.update({ where: { id: existing.id }, data: { report20Matched: true } });
  await recordAudit({ request, actor, action: "MEMBER_REPORT20_MATCHED", entityType: "MEMBER", entityId: member.id, description: `Matched ${member.fullName} against Report 20 file ${checkedImport.fileName}`, afterData: { report20Matched: true, importJobId: latestImport.id }, regionId: existing.district.regionId, districtId: existing.districtId });
  response.json({ success: true, data: { matched: true, alreadyMatched: false, checkedImport, member } });
});

memberWorkflowRouter.post("/bulk/approve", authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"), async (request, response) => {
  const body = bulkApproveSchema.safeParse(request.body);
  if (!body.success) {
    response.status(400).json({ success: false, message: "Select between 1 and 100 valid members" });
    return;
  }
  const actor = user(response);
  const results = [];
  for (const memberId of body.data.memberIds) {
    try {
      const existing = await accessibleMember(memberId, actor);
      if (!existing) { results.push({ memberId, success: false, message: "Member not found or outside your access scope" }); continue; }
      if (!(existing.status === "PENDING" || existing.status === "RETURNED" || existing.status === "FLAGGED")) { results.push({ memberId, success: false, memberName: existing.fullName, message: "Member is no longer pending approval" }); continue; }
      if (existing.status === "FLAGGED" && !existing.report20Matched) { results.push({ memberId, success: false, memberName: existing.fullName, message: "Not yet matched against Report 20" }); continue; }
      const toStatus = existing.report20Matched ? "ACTIVE" : "FLAGGED";
      const [member, event] = await prisma.$transaction([
        prisma.member.update({ where: { id: existing.id }, data: { status: toStatus } }),
        prisma.memberWorkflowEvent.create({ data: { memberId: existing.id, action: "APPROVED", fromStatus: existing.status, toStatus, performedById: actor.id } }),
      ]);
      await recordAudit({ request, actor, action: "MEMBER_APPROVED", entityType: "MEMBER", entityId: member.id, description: `Bulk-approved ${member.fullName}`, beforeData: { status: existing.status }, afterData: { status: member.status, workflowEventId: event.id, bulk: true }, regionId: existing.district.regionId, districtId: existing.districtId });
      await notifyMember({ memberId: member.id, type: "MEMBER_APPROVED", title: "Membership approved", message: toStatus === "ACTIVE" ? "Your GNAT Supreme Care membership has been approved and is active." : "Your membership has been approved and flagged for Report 20 follow-up.", idempotencyKey: `member-workflow:${event.id}` });
      results.push({ memberId, success: true, memberName: member.fullName, status: toStatus });
    } catch (error) {
      results.push({ memberId, success: false, message: error instanceof Error ? error.message : "Approval failed" });
    }
  }
  const succeeded = results.filter((item) => item.success).length;
  response.json({ success: true, data: { requested: results.length, succeeded, failed: results.length - succeeded, results } });
});

memberWorkflowRouter.post("/bulk/return", authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"), async (request, response) => {
  const body = bulkReturnSchema.safeParse(request.body);
  if (!body.success) {
    response.status(400).json({ success: false, message: "Select valid members and provide a return note" });
    return;
  }
  const actor = user(response);
  const results = [];
  for (const memberId of body.data.memberIds) {
    try {
      const existing = await accessibleMember(memberId, actor);
      if (!existing) { results.push({ memberId, success: false, message: "Member not found or outside your access scope" }); continue; }
      if (!(existing.status === "PENDING" || existing.status === "FLAGGED")) { results.push({ memberId, success: false, memberName: existing.fullName, message: "Member can no longer be returned" }); continue; }
      const [member, event] = await prisma.$transaction([
        prisma.member.update({ where: { id: existing.id }, data: { status: "RETURNED" } }),
        prisma.memberWorkflowEvent.create({ data: { memberId: existing.id, action: "RETURNED", fromStatus: existing.status, toStatus: "RETURNED", note: body.data.note, performedById: actor.id } }),
      ]);
      await recordAudit({ request, actor, action: "MEMBER_RETURNED", entityType: "MEMBER", entityId: member.id, description: `Bulk-returned ${member.fullName} for correction`, beforeData: { status: existing.status }, afterData: { status: member.status, note: body.data.note, workflowEventId: event.id, bulk: true }, regionId: existing.district.regionId, districtId: existing.districtId });
      await notifyMember({ memberId: member.id, type: "MEMBER_RETURNED", title: "Membership needs correction", message: `Your membership record was returned for correction: ${body.data.note}`, idempotencyKey: `member-workflow:${event.id}` });
      results.push({ memberId, success: true, memberName: member.fullName, status: "RETURNED" });
    } catch (error) {
      results.push({ memberId, success: false, message: error instanceof Error ? error.message : "Return failed" });
    }
  }
  const succeeded = results.filter((item) => item.success).length;
  response.json({ success: true, data: { requested: results.length, succeeded, failed: results.length - succeeded, results } });
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
  if (!(["PENDING", "RETURNED", "FLAGGED"] as const).includes(existing.status as "PENDING" | "RETURNED" | "FLAGGED")) {
    response.status(409).json({ success: false, message: "Only pending, returned, or flagged members can be approved" });
    return;
  }
  if (existing.status === "FLAGGED" && !existing.report20Matched) {
    response.status(409).json({ success: false, message: "This member still isn't matched against Report 20 — check or re-run reconciliation before approving to Active" });
    return;
  }
  const toStatus = existing.report20Matched ? "ACTIVE" : "FLAGGED";
  const [member, event] = await prisma.$transaction([
    prisma.member.update({ where: { id: existing.id }, data: { status: toStatus } }),
    prisma.memberWorkflowEvent.create({ data: { memberId: existing.id, action: "APPROVED", fromStatus: existing.status, toStatus, performedById: actor.id } }),
  ]);
  await recordAudit({ request, actor, action: "MEMBER_APPROVED", entityType: "MEMBER", entityId: member.id, description: `Approved ${member.fullName}`, beforeData: { status: existing.status }, afterData: { status: member.status, workflowEventId: event.id }, regionId: existing.district.regionId, districtId: existing.districtId });
  await notifyMember({ memberId: member.id, type: "MEMBER_APPROVED", title: "Membership approved", message: toStatus === "ACTIVE" ? "Your GNAT Supreme Care membership has been approved and is active." : "Your membership has been approved and flagged for Report 20 follow-up.", idempotencyKey: `member-workflow:${event.id}` });
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
  await notifyMember({ memberId: member.id, type: "MEMBER_RETURNED", title: "Membership needs correction", message: `Your membership record was returned for correction: ${body.data.note}`, idempotencyKey: `member-workflow:${event.id}` });
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
  await notifyMember({ memberId: result.member.id, type: "MEMBER_REMOVED", title: "Membership status changed", message: `Your GNAT Supreme Care membership has been removed. Reason: ${body.data.reason}.`, idempotencyKey: `member-workflow:${result.event.id}` });
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

changeRequestRouter.patch("/:id/review", authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN", "DISTRICT_ADMIN"), async (request, response) => {
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
      if (item.type === "MEMBER_DETAILS") {
        const data = memberDetailsChangeSchema.parse(item.proposedData);
        await transaction.member.update({ where: { id: item.memberId }, data: { ...data, ...(Object.prototype.hasOwnProperty.call(data, "phone") && data.phone !== item.member.phone ? { phoneVerifiedAt: null } : {}) } });
      }
      if (item.type === "SPOUSE") {
        const data = spouseSchema.parse(item.proposedData);
        await transaction.spouse.upsert({ where: { memberId: item.memberId }, update: data, create: { ...data, memberId: item.memberId } });
        await transaction.member.update({ where: { id: item.memberId }, data: { spouseDeclarationStatus: "HAS_SPOUSE" } });
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
  await notifyMember({ memberId: item.memberId, type: `CHANGE_REQUEST_${reviewed!.status}`, title: "Change request updated", message: `Your ${item.type.toLowerCase().replaceAll("_", " ")} request was ${reviewed!.status.toLowerCase()}${reviewed!.reviewNote ? `: ${reviewed!.reviewNote}` : "."}`, idempotencyKey: `change-request-review:${item.id}:${reviewed!.status}` });
  response.json({ success: true, data: reviewed });
});
