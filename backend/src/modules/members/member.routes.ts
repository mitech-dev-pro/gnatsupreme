import { Router, type Response } from "express";
import type { ZodError } from "zod";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { authorizeRoles } from "../../middleware/authorize.js";
import { recordAudit } from "../audit/audit.service.js";
import { canAccessDistrict, memberScope } from "./member.access.js";
import {
  beneficiaryIdParamsSchema,
  beneficiarySchema,
  createMemberSchema,
  memberIdParamsSchema,
  memberQuerySchema,
  memberStatusSchema,
  spouseSchema,
  updateMemberSchema,
} from "./member.schemas.js";

export const memberRouter = Router();

const memberInclude = {
  district: { include: { region: { select: { id: true, name: true } } } },
  spouse: true,
  beneficiaries: { orderBy: { id: "asc" as const } },
  createdBy: { select: { id: true, fullName: true } },
} as const;

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

async function findAccessibleMember(id: number, user: AuthenticatedUser) {
  return prisma.member.findFirst({
    where: { id, ...memberScope(user) },
    include: memberInclude,
  });
}

async function ghanaCardIsUsed(
  ghanaCardId: string | null | undefined,
  exclusions: { memberId?: number; spouseId?: number } = {},
) {
  if (!ghanaCardId) return false;
  const [member, spouse] = await Promise.all([
    prisma.member.findFirst({
      where: { ghanaCardId, ...(exclusions.memberId ? { id: { not: exclusions.memberId } } : {}) },
      select: { id: true },
    }),
    prisma.spouse.findFirst({
      where: { ghanaCardId, ...(exclusions.spouseId ? { id: { not: exclusions.spouseId } } : {}) },
      select: { id: true },
    }),
  ]);
  return Boolean(member || spouse);
}

memberRouter.use(authenticate);

memberRouter.get("/", async (request, response) => {
  const query = memberQuerySchema.safeParse(request.query);
  if (!query.success) return validationFailure(response, query.error);

  const user = currentUser(response);
  const { page, limit, search, status, regionId, districtId } = query.data;
  const requestedScope =
    user.role === "SUPER_ADMIN" || user.role === "NATIONAL_ADMIN"
      ? districtId
        ? { districtId }
        : regionId
          ? { district: { regionId } }
          : {}
      : memberScope(user);
  const where = {
    ...requestedScope,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" as const } },
            { controllerId: { contains: search } },
            { ghanaCardId: { contains: search, mode: "insensitive" as const } },
            { school: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [members, total] = await prisma.$transaction([
    prisma.member.findMany({
      where,
      include: memberInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.member.count({ where }),
  ]);
  response.json({
    success: true,
    data: members,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

memberRouter.get("/:id", async (request, response) => {
  const params = memberIdParamsSchema.safeParse(request.params);
  if (!params.success) return validationFailure(response, params.error);

  const member = await findAccessibleMember(params.data.id, currentUser(response));
  if (!member) {
    response.status(404).json({ success: false, message: "Member not found" });
    return;
  }
  response.json({ success: true, data: member });
});

memberRouter.post("/", async (request, response) => {
  const parsed = createMemberSchema.safeParse(request.body);
  if (!parsed.success) return validationFailure(response, parsed.error);

  const user = currentUser(response);
  if (!(await canAccessDistrict(user, parsed.data.districtId))) {
    response.status(403).json({ success: false, message: "You cannot enroll members in this district" });
    return;
  }

  const district = await prisma.district.findUnique({ where: { id: parsed.data.districtId } });
  if (!district) {
    response.status(400).json({ success: false, message: "Selected district does not exist" });
    return;
  }
  const duplicateController = await prisma.member.findUnique({
    where: { controllerId: parsed.data.controllerId },
  });
  if (duplicateController) {
    response.status(409).json({ success: false, message: "This Controller ID is already enrolled" });
    return;
  }
  if (await ghanaCardIsUsed(parsed.data.ghanaCardId)) {
    response.status(409).json({ success: false, message: "This Ghana Card ID is already in use" });
    return;
  }
  if (parsed.data.spouse && (await ghanaCardIsUsed(parsed.data.spouse.ghanaCardId))) {
    response.status(409).json({ success: false, message: "The spouse Ghana Card ID is already in use" });
    return;
  }
  if (
    parsed.data.ghanaCardId &&
    parsed.data.spouse?.ghanaCardId &&
    parsed.data.ghanaCardId === parsed.data.spouse.ghanaCardId
  ) {
    response.status(400).json({ success: false, message: "Member and spouse cannot use the same Ghana Card ID" });
    return;
  }

  const { spouse, beneficiaries, ...memberData } = parsed.data;
  const member = await prisma.member.create({
    data: {
      ...memberData,
      createdById: user.id,
      ...(spouse ? { spouse: { create: spouse } } : {}),
      beneficiaries: { create: beneficiaries },
    },
    include: memberInclude,
  });
  await recordAudit({
    request,
    actor: user,
    action: "MEMBER_ENROLLED",
    entityType: "MEMBER",
    entityId: member.id,
    description: `Enrolled ${member.fullName} (${member.controllerId})`,
    afterData: {
      controllerId: member.controllerId,
      fullName: member.fullName,
      school: member.school,
      status: member.status,
      districtId: member.districtId,
      spouseRecorded: Boolean(member.spouse),
      beneficiaryCount: member.beneficiaries.length,
    },
    regionId: member.district.regionId,
    districtId: member.districtId,
  });
  response.status(201).json({ success: true, data: member });
});

memberRouter.patch("/:id", async (request, response) => {
  const params = memberIdParamsSchema.safeParse(request.params);
  const body = updateMemberSchema.safeParse(request.body);
  if (!params.success) return validationFailure(response, params.error);
  if (!body.success) return validationFailure(response, body.error);

  const user = currentUser(response);
  const existing = await findAccessibleMember(params.data.id, user);
  if (!existing) {
    response.status(404).json({ success: false, message: "Member not found" });
    return;
  }
  if (body.data.districtId && !(await canAccessDistrict(user, body.data.districtId))) {
    response.status(403).json({ success: false, message: "You cannot move this member to that district" });
    return;
  }
  if (body.data.districtId) {
    const district = await prisma.district.findUnique({ where: { id: body.data.districtId } });
    if (!district) {
      response.status(400).json({ success: false, message: "Selected district does not exist" });
      return;
    }
  }
  if (body.data.controllerId && body.data.controllerId !== existing.controllerId) {
    const duplicate = await prisma.member.findUnique({ where: { controllerId: body.data.controllerId } });
    if (duplicate) {
      response.status(409).json({ success: false, message: "This Controller ID is already enrolled" });
      return;
    }
  }
  if (await ghanaCardIsUsed(body.data.ghanaCardId, { memberId: existing.id })) {
    response.status(409).json({ success: false, message: "This Ghana Card ID is already in use" });
    return;
  }

  const member = await prisma.member.update({
    where: { id: existing.id },
    data: body.data,
    include: memberInclude,
  });
  await recordAudit({
    request,
    actor: user,
    action: "MEMBER_UPDATED",
    entityType: "MEMBER",
    entityId: member.id,
    description: `Updated ${member.fullName} (${member.controllerId})`,
    beforeData: {
      controllerId: existing.controllerId,
      fullName: existing.fullName,
      school: existing.school,
      districtId: existing.districtId,
      report20Matched: existing.report20Matched,
    },
    afterData: {
      controllerId: member.controllerId,
      fullName: member.fullName,
      school: member.school,
      districtId: member.districtId,
      report20Matched: member.report20Matched,
    },
    regionId: member.district.regionId,
    districtId: member.districtId,
  });
  response.json({ success: true, data: member });
});

memberRouter.patch(
  "/:id/status",
  authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"),
  async (request, response) => {
    const params = memberIdParamsSchema.safeParse(request.params);
    const body = memberStatusSchema.safeParse(request.body);
    if (!params.success) return validationFailure(response, params.error);
    if (!body.success) return validationFailure(response, body.error);

    const existing = await findAccessibleMember(params.data.id, currentUser(response));
    if (!existing) {
      response.status(404).json({ success: false, message: "Member not found" });
      return;
    }
    const member = await prisma.member.update({
      where: { id: existing.id },
      data: { status: body.data.status },
      include: memberInclude,
    });
    await recordAudit({
      request,
      actor: currentUser(response),
      action: "MEMBER_STATUS_CHANGED",
      entityType: "MEMBER",
      entityId: member.id,
      description: `Changed ${member.fullName} from ${existing.status} to ${member.status}`,
      beforeData: { status: existing.status },
      afterData: { status: member.status },
      regionId: member.district.regionId,
      districtId: member.districtId,
    });
    response.json({ success: true, data: member });
  },
);

memberRouter.put("/:id/spouse", async (request, response) => {
  const params = memberIdParamsSchema.safeParse(request.params);
  const body = spouseSchema.safeParse(request.body);
  if (!params.success) return validationFailure(response, params.error);
  if (!body.success) return validationFailure(response, body.error);

  const member = await findAccessibleMember(params.data.id, currentUser(response));
  if (!member) {
    response.status(404).json({ success: false, message: "Member not found" });
    return;
  }
  if (await ghanaCardIsUsed(body.data.ghanaCardId, { spouseId: member.spouse?.id })) {
    response.status(409).json({ success: false, message: "This Ghana Card ID is already in use" });
    return;
  }
  if (body.data.ghanaCardId && body.data.ghanaCardId === member.ghanaCardId) {
    response.status(400).json({ success: false, message: "Member and spouse cannot use the same Ghana Card ID" });
    return;
  }

  const spouse = await prisma.spouse.upsert({
    where: { memberId: member.id },
    update: body.data,
    create: { ...body.data, memberId: member.id },
  });
  await recordAudit({
    request,
    actor: currentUser(response),
    action: member.spouse ? "SPOUSE_UPDATED" : "SPOUSE_ADDED",
    entityType: "SPOUSE",
    entityId: spouse.id,
    description: `${member.spouse ? "Updated" : "Added"} spouse for ${member.fullName}`,
    beforeData: member.spouse
      ? { fullName: member.spouse.fullName, dateOfBirth: member.spouse.dateOfBirth }
      : undefined,
    afterData: { fullName: spouse.fullName, dateOfBirth: spouse.dateOfBirth },
    regionId: member.district.regionId,
    districtId: member.districtId,
  });
  response.json({ success: true, data: spouse });
});

memberRouter.delete("/:id/spouse", async (request, response) => {
  const params = memberIdParamsSchema.safeParse(request.params);
  if (!params.success) return validationFailure(response, params.error);
  const member = await findAccessibleMember(params.data.id, currentUser(response));
  if (!member) {
    response.status(404).json({ success: false, message: "Member not found" });
    return;
  }
  await prisma.spouse.deleteMany({ where: { memberId: member.id } });
  await recordAudit({
    request,
    actor: currentUser(response),
    action: "SPOUSE_REMOVED",
    entityType: "SPOUSE",
    entityId: member.spouse?.id,
    description: `Removed spouse from ${member.fullName}`,
    beforeData: member.spouse
      ? { fullName: member.spouse.fullName, dateOfBirth: member.spouse.dateOfBirth }
      : undefined,
    regionId: member.district.regionId,
    districtId: member.districtId,
  });
  response.status(204).send();
});

memberRouter.post("/:id/beneficiaries", async (request, response) => {
  const params = memberIdParamsSchema.safeParse(request.params);
  const body = beneficiarySchema.safeParse(request.body);
  if (!params.success) return validationFailure(response, params.error);
  if (!body.success) return validationFailure(response, body.error);
  const member = await findAccessibleMember(params.data.id, currentUser(response));
  if (!member) {
    response.status(404).json({ success: false, message: "Member not found" });
    return;
  }
  if (member.beneficiaries.length >= 10) {
    response.status(409).json({ success: false, message: "A member cannot have more than 10 beneficiaries" });
    return;
  }
  const beneficiary = await prisma.beneficiary.create({
    data: { ...body.data, memberId: member.id },
  });
  await recordAudit({
    request,
    actor: currentUser(response),
    action: "BENEFICIARY_ADDED",
    entityType: "BENEFICIARY",
    entityId: beneficiary.id,
    description: `Added beneficiary for ${member.fullName}`,
    afterData: { fullName: beneficiary.fullName, relationship: beneficiary.relationship },
    regionId: member.district.regionId,
    districtId: member.districtId,
  });
  response.status(201).json({ success: true, data: beneficiary });
});

memberRouter.patch("/:id/beneficiaries/:beneficiaryId", async (request, response) => {
  const params = beneficiaryIdParamsSchema.safeParse(request.params);
  const body = beneficiarySchema.partial().refine((value) => Object.keys(value).length > 0).safeParse(request.body);
  if (!params.success) return validationFailure(response, params.error);
  if (!body.success) return validationFailure(response, body.error);
  const member = await findAccessibleMember(params.data.id, currentUser(response));
  if (!member || !member.beneficiaries.some((item) => item.id === params.data.beneficiaryId)) {
    response.status(404).json({ success: false, message: "Beneficiary not found" });
    return;
  }
  const beneficiary = await prisma.beneficiary.update({
    where: { id: params.data.beneficiaryId },
    data: body.data,
  });
  const previous = member.beneficiaries.find((item) => item.id === params.data.beneficiaryId);
  await recordAudit({
    request,
    actor: currentUser(response),
    action: "BENEFICIARY_UPDATED",
    entityType: "BENEFICIARY",
    entityId: beneficiary.id,
    description: `Updated beneficiary for ${member.fullName}`,
    beforeData: previous ? { fullName: previous.fullName, relationship: previous.relationship } : undefined,
    afterData: { fullName: beneficiary.fullName, relationship: beneficiary.relationship },
    regionId: member.district.regionId,
    districtId: member.districtId,
  });
  response.json({ success: true, data: beneficiary });
});

memberRouter.delete("/:id/beneficiaries/:beneficiaryId", async (request, response) => {
  const params = beneficiaryIdParamsSchema.safeParse(request.params);
  if (!params.success) return validationFailure(response, params.error);
  const member = await findAccessibleMember(params.data.id, currentUser(response));
  if (!member || !member.beneficiaries.some((item) => item.id === params.data.beneficiaryId)) {
    response.status(404).json({ success: false, message: "Beneficiary not found" });
    return;
  }
  if (member.beneficiaries.length === 1) {
    response.status(409).json({ success: false, message: "A member must retain at least one beneficiary" });
    return;
  }
  const beneficiary = member.beneficiaries.find((item) => item.id === params.data.beneficiaryId);
  await prisma.beneficiary.delete({ where: { id: params.data.beneficiaryId } });
  await recordAudit({
    request,
    actor: currentUser(response),
    action: "BENEFICIARY_REMOVED",
    entityType: "BENEFICIARY",
    entityId: params.data.beneficiaryId,
    description: `Removed beneficiary from ${member.fullName}`,
    beforeData: beneficiary
      ? { fullName: beneficiary.fullName, relationship: beneficiary.relationship }
      : undefined,
    regionId: member.district.regionId,
    districtId: member.districtId,
  });
  response.status(204).send();
});
