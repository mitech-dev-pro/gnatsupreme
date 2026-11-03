import { AppError } from "../../middleware/error-handler.js";
import type { AuthenticatedUser } from "../../middleware/authenticate.js";
import { invalidateMemberAuth } from "../../lib/auth-cache.js";
import { prisma } from "../../lib/prisma.js";
import { type AuditRequestSource } from "../audit/audit.service.js";
import { reserveChangeReview } from "./change-request.concurrency.js";
import { memberScope } from "../members/member.access.js";
import {
  auditLinkChanges,
  memberGhanaCardConflict,
  reconcileSpouseLink,
  relinkSpousesForMember,
  spouseGhanaCardConflict,
} from "../members/member.service.js";
import { beneficiarySchema, spouseSchema } from "../members/member.schemas.js";
import { memberDetailsChangeSchema } from "./workflow.schemas.js";

// Shared by both the single-item and bulk review routes so their `item` shapes can never drift
// apart (which previously broke the type-level guarantee that both routes apply decisions
// identically). Returns null if the request doesn't exist, isn't pending, or is outside the
// actor's scope -- the caller decides how to report that.
export async function findReviewableChangeRequest(id: number, actor: AuthenticatedUser) {
  return prisma.memberChangeRequest.findFirst({
    where: { id, status: "PENDING", member: { is: memberScope(actor) } },
    include: {
      member: { include: { beneficiaries: true, district: { select: { regionId: true } } } },
    },
  });
}

type ChangeRequestWithMember = NonNullable<Awaited<ReturnType<typeof findReviewableChangeRequest>>>;

// Shared by both the single-item and bulk review routes -- every validation check and the
// approve/return/reject transaction itself must stay byte-identical between the two, or a
// decision could silently behave differently depending on which endpoint a staff member used.
// Validation failures throw AppError rather than writing to `response` directly, so each caller
// can format the failure its own way (a single JSON response vs. one entry in a results array).
export async function applyChangeRequestDecision(
  request: AuditRequestSource,
  item: ChangeRequestWithMember,
  actor: AuthenticatedUser,
  action: "APPROVE" | "RETURN" | "REJECT",
  note: string | null | undefined,
) {
  let existingSpouse: { id: number; ghanaCardId: string | null } | null = null;
  if (action === "APPROVE" && item.type === "MEMBER_DETAILS") {
    const data = memberDetailsChangeSchema.parse(item.proposedData);
    if (await memberGhanaCardConflict(data.ghanaCardId, { memberId: item.memberId })) {
      throw new AppError(409, "The proposed Ghana Card ID is already in use");
    }
  }
  if (action === "APPROVE" && item.type === "SPOUSE") {
    const data = spouseSchema.parse(item.proposedData);
    existingSpouse = await prisma.spouse.findUnique({
      where: { memberId: item.memberId },
      select: { id: true, ghanaCardId: true },
    });
    if (
      (data.ghanaCardId != null && data.ghanaCardId === item.member.ghanaCardId) ||
      (await spouseGhanaCardConflict(data.ghanaCardId, { spouseId: existingSpouse?.id }))
    ) {
      throw new AppError(409, "The proposed spouse Ghana Card ID is already in use");
    }
  }
  if (
    action === "APPROVE" &&
    item.type === "BENEFICIARY_ADD" &&
    item.member.beneficiaries.length >= 10
  ) {
    throw new AppError(409, "A member cannot have more than 10 beneficiaries");
  }
  if (
    action === "APPROVE" &&
    item.targetBeneficiaryId &&
    !item.member.beneficiaries.some((person) => person.id === item.targetBeneficiaryId)
  ) {
    throw new AppError(
      409,
      "The beneficiary is no longer on this member record. Refresh the request.",
    );
  }

  let reviewed: Awaited<ReturnType<typeof prisma.memberChangeRequest.findUnique>> = null;
  let linkChanges: Awaited<ReturnType<typeof relinkSpousesForMember>> = [];
  if (action === "APPROVE") {
    await prisma.$transaction(async (transaction) => {
      await reserveChangeReview(transaction, item, actor);
      if (item.type === "MEMBER_DETAILS") {
        const data = memberDetailsChangeSchema.parse(item.proposedData);
        const updatedMember = await transaction.member.update({
          where: { id: item.memberId },
          data: {
            ...data,
            ...(Object.prototype.hasOwnProperty.call(data, "phone") &&
            data.phone !== item.member.phone
              ? { phoneVerifiedAt: null }
              : {}),
          },
        });
        if (Object.prototype.hasOwnProperty.call(data, "ghanaCardId")) {
          linkChanges = await relinkSpousesForMember(
            transaction,
            item.memberId,
            updatedMember.ghanaCardId,
          );
        }
      }
      if (item.type === "SPOUSE") {
        const data = spouseSchema.parse(item.proposedData);
        const upsertedSpouse = await transaction.spouse.upsert({
          where: { memberId: item.memberId },
          update: data,
          create: { ...data, memberId: item.memberId },
        });
        await transaction.member.update({
          where: { id: item.memberId },
          data: { spouseDeclarationStatus: "HAS_SPOUSE" },
        });
        const change = await reconcileSpouseLink(
          transaction,
          upsertedSpouse.id,
          upsertedSpouse.ghanaCardId,
          item.memberId,
          existingSpouse?.ghanaCardId,
        );
        if (change) linkChanges = [change];
      }
      if (item.type === "BENEFICIARY_ADD")
        await transaction.beneficiary.create({
          data: { ...beneficiarySchema.parse(item.proposedData), memberId: item.memberId },
        });
      if (item.type === "BENEFICIARY_UPDATE")
        await transaction.beneficiary.update({
          where: { id: item.targetBeneficiaryId!, memberId: item.memberId },
          data: beneficiarySchema.parse(item.proposedData),
        });
      if (item.type === "BENEFICIARY_REMOVE") {
        if (item.member.beneficiaries.length <= 1)
          throw new AppError(409, "A member must retain at least one beneficiary");
        await transaction.beneficiary.delete({
          where: { id: item.targetBeneficiaryId!, memberId: item.memberId },
        });
      }
      reviewed = await transaction.memberChangeRequest.update({
        where: { id: item.id },
        data: {
          status: "APPROVED",
          reviewedById: actor.id,
          reviewNote: note,
          reviewedAt: new Date(),
        },
      });
    });
    await invalidateMemberAuth(item.memberId);
    await auditLinkChanges(request, actor, linkChanges);
  } else {
    await prisma.$transaction(async (transaction) => {
      await reserveChangeReview(transaction, item, actor);
      reviewed = await transaction.memberChangeRequest.update({
        where: { id: item.id },
        data: {
          status: action === "RETURN" ? "RETURNED" : "REJECTED",
          reviewedById: actor.id,
          reviewNote: note,
          reviewedAt: new Date(),
        },
      });
    });
  }
  return reviewed!;
}
