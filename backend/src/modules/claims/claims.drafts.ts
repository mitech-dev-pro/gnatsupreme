import { Router, type Response } from "express";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import type { AuthenticatedUser } from "../../middleware/authenticate.js";
import type { AuthenticatedMember } from "../../middleware/authenticate-member.js";
import { memberScope } from "../members/member.access.js";
import { recordAudit } from "../audit/audit.service.js";

const text = z.string().max(5000);
// Incomplete input is allowed, but only known form fields are persisted. A declaration
// is deliberately absent: the person submitting must accept it again after resuming.
export const draftPayloadSchema = z.object({
  claimType: z.enum([
    "",
    "DEATH",
    "TOTAL_PERMANENT_DISABILITY",
    "CRITICAL_ILLNESS",
    "HOSPITALIZATION",
  ]),
  claimantType: z.enum(["MEMBER", "SPOUSE"]),
  claimantIdNumber: z.string().max(80),
  contact: z.object({
    fullName: z.string().max(120),
    nationality: z.string().max(80),
    email: z.string().max(254),
    gpsAddress: z.string().max(120),
    residentialAddress: z.string().max(240),
  }),
  details: z.object({
    subjectName: text,
    relationship: text,
    dateOfEvent: text,
    cause: text,
    diagnosisDate: text,
    diagnosingHospital: text,
    diagnosingPhysician: text,
    illness: text,
    illnessOther: text,
    hospitalName: text,
    admissionDate: text,
    dischargeDate: text,
    reason: text,
  }),
  paymentDetails: z.object({ payeeName: z.string().max(150).optional() }),
  notes: z.string().max(1000),
  page: z.number().int().min(-1).max(1),
});
export const saveDraftSchema = z.object({
  memberId: z.number().int().positive(),
  payload: draftPayloadSchema,
  documentIds: z.array(z.number().int().positive()).max(10),
  revision: z.number().int().positive().optional(),
  submissionKey: z.string().uuid().optional(),
});
type Actor =
  { user: AuthenticatedUser; member?: never } | { member: AuthenticatedMember; user?: never };
export function draftOwnership(actor: Actor): Prisma.ClaimDraftWhereInput {
  return actor.user
    ? { preparedById: actor.user.id, member: memberScope(actor.user) }
    : { preparedByMemberId: actor.member.id, memberId: actor.member.id };
}
function validated<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(400, "Invalid draft ID, revision or pagination.");
  return result.data;
}
function actorFor(response: Response, audience: "staff" | "member"): Actor {
  return audience === "staff"
    ? { user: response.locals.user as AuthenticatedUser }
    : { member: response.locals.member as AuthenticatedMember };
}
const memberSelect = { id: true, controllerId: true, fullName: true } as const;
const idSchema = z.coerce.number().int().positive();
const conflict = () =>
  new AppError(
    409,
    "This draft changed in another tab or was submitted. Your current edits have not overwritten it. Reload the latest draft before saving again.",
    "DRAFT_CONFLICT",
  );

async function documentMetadata(
  drafts: { memberId: number; documentIds: number[] }[],
  actor: Actor,
) {
  return prisma.storedFile.findMany({
    where: {
      id: { in: [...new Set(drafts.flatMap((draft) => draft.documentIds))] },
      memberId: { in: [...new Set(drafts.map((draft) => draft.memberId))] },
      category: "CLAIM_DOCUMENT",
      ...(actor.member ? { uploadedByMemberId: actor.member.id } : {}),
    },
    select: { id: true, memberId: true, originalName: true, slotKey: true },
  });
}

// Mount only after the audience's authentication middleware.
export function createClaimDraftRouter(audience: "staff" | "member") {
  const router = Router();
  router.get("/", async (request, response) => {
    const query = validated(
      z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(50).default(10),
      }),
      request.query,
    );
    const actor = actorFor(response, audience),
      where = { ...draftOwnership(actor), submittedClaimId: null };
    const [drafts, total] = await Promise.all([
      prisma.claimDraft.findMany({
        where,
        include: { member: { select: memberSelect } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.claimDraft.count({ where }),
    ]);
    const files = await documentMetadata(drafts, actor);
    response.json({
      success: true,
      data: drafts.map((draft) => ({
        ...draft,
        submissionKey: undefined,
        documents: files.filter(
          (file) => file.memberId === draft.memberId && draft.documentIds.includes(file.id),
        ),
      })),
      pagination: { total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    });
  });
  router.get("/:id", async (request, response) => {
    const actor = actorFor(response, audience);
    const draft = await prisma.claimDraft.findFirst({
      where: { id: validated(idSchema, request.params.id), ...draftOwnership(actor) },
      include: { member: { select: memberSelect } },
    });
    if (!draft) throw new AppError(404, "Draft not found");
    if (draft.submittedClaimId) {
      response
        .status(409)
        .json({
          success: false,
          message: "This draft has already been submitted.",
          submissionId: draft.submittedClaimId,
        });
      return;
    }
    const documents = await documentMetadata([draft], actor);
    response.json({
      success: true,
      data: {
        ...draft,
        documents,
        missingDocumentCount: draft.documentIds.length - documents.length,
      },
    });
  });
  const save =
    (update: boolean) => async (request: import("express").Request, response: Response) => {
      const parsed = saveDraftSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "The draft contains invalid or oversized fields.");
      const input = parsed.data,
        actor = actorFor(response, audience);
      if (actor.member && actor.member.id !== input.memberId)
        throw new AppError(404, "Member not found");
      const policy = await prisma.member.findFirst({
        where: { id: input.memberId, ...(actor.user ? memberScope(actor.user) : {}) },
        select: memberSelect,
      });
      if (!policy) throw new AppError(404, "Member not found");
      const ids = [...new Set(input.documentIds)],
        files = await documentMetadata([{ memberId: input.memberId, documentIds: ids }], actor);
      if (files.length !== ids.length)
        throw new AppError(
          400,
          "One or more draft attachments are unavailable or do not belong to this member.",
        );
      const data = { payload: input.payload, documentIds: ids };
      let draft;
      if (update) {
        const id = validated(idSchema, request.params.id);
        draft = await prisma.$transaction(async (transaction) => {
          const existing = await transaction.claimDraft.findFirst({
            where: { id, ...draftOwnership(actor) },
          });
          if (!existing) throw new AppError(404, "Draft not found");
          if (existing.memberId !== input.memberId)
            throw new AppError(400, "A saved draft cannot be moved to a different member.");
          if (!input.revision) throw new AppError(400, "Provide the saved draft revision.");
          const result = await transaction.claimDraft.updateMany({
            where: {
              id,
              ...draftOwnership(actor),
              revision: input.revision,
              submittedClaimId: null,
            },
            data: { ...data, revision: { increment: 1 } },
          });
          if (!result.count) throw conflict();
          return transaction.claimDraft.findFirstOrThrow({
            where: { id, ...draftOwnership(actor) },
          });
        });
      } else {
        draft = await prisma.claimDraft.create({
          data: {
            ...data,
            ...(input.submissionKey ? { submissionKey: input.submissionKey } : {}),
            memberId: input.memberId,
            ...(actor.user
              ? { preparedById: actor.user.id }
              : { preparedByMemberId: actor.member.id }),
          },
        });
      }
      await recordAudit({
        request,
        actor: actor.user,
        action: update ? "CLAIM_DRAFT_SAVED" : "CLAIM_DRAFT_CREATED",
        entityType: "CLAIM_DRAFT",
        entityId: draft.id,
        description: "Saved an unfinished claim without submitting it",
        afterData: { memberId: policy.id, revision: draft.revision },
      });
      response
        .status(update ? 200 : 201)
        .json({ success: true, data: { ...draft, member: policy, documents: files } });
    };
  router.post("/", save(false));
  router.put("/:id", save(true));
  router.delete("/:id", async (request, response) => {
    const actor = actorFor(response, audience),
      id = validated(idSchema, request.params.id),
      revision = validated(idSchema, request.query.revision);
    const existing = await prisma.claimDraft.findFirst({ where: { id, ...draftOwnership(actor) } });
    if (!existing) throw new AppError(404, "Draft not found");
    const result = await prisma.claimDraft.deleteMany({
      where: { id, ...draftOwnership(actor), revision, submittedClaimId: null },
    });
    if (!result.count) throw conflict();
    await recordAudit({
      request,
      actor: actor.user,
      action: "CLAIM_DRAFT_DELETED",
      entityType: "CLAIM_DRAFT",
      entityId: id,
      description: "Deleted an unfinished claim draft",
      afterData: { memberId: existing.memberId },
    });
    response.json({ success: true });
  });
  return router;
}

export async function commitClaimDraft<T extends { id: number }>(
  input: { draftId?: number; draftRevision?: number },
  actor: Actor,
  memberId: number,
  save: (
    transaction: Omit<
      typeof prisma,
      "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
    >,
    key?: string,
  ) => Promise<T>,
): Promise<T> {
  if (!input.draftId) return save(prisma);
  if (actor.member && actor.member.id !== memberId) throw new AppError(404, "Draft not found");
  if (!input.draftRevision) throw new AppError(400, "Provide the saved draft revision.");
  return prisma.$transaction(async (transaction) => {
    const draft = await transaction.claimDraft.findFirst({
      where: { id: input.draftId, memberId, ...draftOwnership(actor) },
    });
    if (!draft) throw new AppError(404, "Draft not found");
    const key = `${actor.user ? "staff" : "member-portal"}:${actor.user ? actor.user.id : actor.member.id}:${draft.submissionKey}`;
    if (draft.submittedClaimId) {
      const claim = await save(transaction, key);
      if (claim.id !== draft.submittedClaimId) throw conflict();
      return claim;
    }
    const locked = await transaction.claimDraft.updateMany({
      where: { id: draft.id, revision: input.draftRevision, submittedClaimId: null },
      data: { revision: { increment: 1 } },
    });
    if (!locked.count) throw conflict();
    const claim = await save(transaction, key);
    const policy = await transaction.externalClaimSubmission.findUnique({
      where: { id: claim.id },
      select: { memberId: true },
    });
    if (!policy || policy.memberId !== memberId)
      throw new AppError(409, "This submission key belongs to another claim.");
    await transaction.claimDraft.update({
      where: { id: draft.id },
      data: { submittedClaimId: claim.id },
    });
    return claim;
  });
}
