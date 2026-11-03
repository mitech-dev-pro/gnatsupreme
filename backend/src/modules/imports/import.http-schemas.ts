import { z } from "zod";
export const idSchema = z.object({ id: z.coerce.number().int().positive() });
export const reportMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .transform((value) => new Date(`${value}-01T00:00:00.000Z`))
  .optional();
export const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
});
export const issueListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  status: z
    .enum(["MATCHED", "CHANGED", "UNMATCHED", "DUPLICATE", "INVALID", "ENROLLED"])
    .optional(),
});
export const resolveRowParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  rowId: z.coerce.number().int().positive(),
});
export const resolveRowBodySchema = z.object({ districtId: z.coerce.number().int().positive() });
