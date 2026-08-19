import { z } from "zod";
import { beneficiarySchema, spouseSchema } from "../members/member.schemas.js";

export const workflowMemberParamsSchema = z.object({ id: z.coerce.number().int().positive() });
export const workflowNoteSchema = z.object({ note: z.string().trim().min(2).max(500) });
export const removalSchema = z
  .object({
    reason: z.enum(["DEATH", "DISABILITY", "RETIREMENT", "RESIGNATION", "OTHER"]),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => value.reason !== "OTHER" || Boolean(value.note), {
    message: "A note is required when the removal reason is OTHER",
    path: ["note"],
  });

export const memberDetailsChangeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    dateOfBirth: z.coerce.date().max(new Date()).nullable().optional(),
    ghanaCardId: z.string().trim().toUpperCase().regex(/^GHA-\d{9}-\d$/).nullable().optional(),
    phone: z.string().trim().min(7).max(30).nullable().optional(),
    school: z.string().trim().min(2).max(160).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Provide at least one proposed change");

export const createChangeRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MEMBER_DETAILS"), proposedData: memberDetailsChangeSchema, requestNote: z.string().trim().max(500).optional() }),
  z.object({ type: z.literal("SPOUSE"), proposedData: spouseSchema, requestNote: z.string().trim().max(500).optional() }),
  z.object({ type: z.literal("BENEFICIARY_ADD"), proposedData: beneficiarySchema, requestNote: z.string().trim().max(500).optional() }),
  z.object({ type: z.literal("BENEFICIARY_UPDATE"), targetBeneficiaryId: z.coerce.number().int().positive(), proposedData: beneficiarySchema, requestNote: z.string().trim().max(500).optional() }),
  z.object({ type: z.literal("BENEFICIARY_REMOVE"), targetBeneficiaryId: z.coerce.number().int().positive(), requestNote: z.string().trim().max(500).optional() }),
]);

export const changeRequestIdSchema = z.object({ id: z.coerce.number().int().positive() });
export const reviewChangeRequestSchema = z.object({
  action: z.enum(["APPROVE", "RETURN", "REJECT"]),
  note: z.string().trim().max(500).nullable().optional(),
}).refine((value) => value.action === "APPROVE" || Boolean(value.note), { message: "A review note is required", path: ["note"] });

export const changeRequestQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["PENDING", "APPROVED", "RETURNED", "REJECTED", "CANCELLED"]).optional(),
  type: z.enum(["MEMBER_DETAILS", "SPOUSE", "BENEFICIARY_ADD", "BENEFICIARY_UPDATE", "BENEFICIARY_REMOVE"]).optional(),
});
