import { z } from "zod";

const nameSchema = z.string().trim().min(2).max(100);

export const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const regionSchema = z.object({
  name: nameSchema,
});

export const districtCreateSchema = z.object({
  name: nameSchema,
  regionId: z.coerce.number().int().positive(),
});

export const districtUpdateSchema = districtCreateSchema.partial().refine(
  (value) => value.name !== undefined || value.regionId !== undefined,
  "Provide at least one field to update",
);

export const districtQuerySchema = z.object({
  regionId: z.coerce.number().int().positive().optional(),
});
