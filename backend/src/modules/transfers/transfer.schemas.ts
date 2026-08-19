import { z } from "zod";

export const createTransferSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  toDistrictId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
});

export const reviewTransferSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().trim().max(500).nullable().optional(),
});

export const cancelTransferSchema = z.object({
  note: z.string().trim().max(500).nullable().optional(),
});

export const transferIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export const transferQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  search: z.string().trim().max(120).optional(),
});
