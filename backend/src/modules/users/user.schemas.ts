import { z } from "zod";

const roleSchema = z.enum([
  "SUPER_ADMIN",
  "NATIONAL_ADMIN",
  "REGIONAL_ADMIN",
  "DISTRICT_ADMIN",
]);

export const staffPasswordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters")
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");

const staffFields = {
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: roleSchema,
  regionId: z.coerce.number().int().positive().nullable().optional(),
  districtId: z.coerce.number().int().positive().nullable().optional(),
};

export const createUserSchema = z.object({
  ...staffFields,
  password: staffPasswordSchema,
});

export const updateUserSchema = z
  .object(staffFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const updateUserStatusSchema = z.object({ isActive: z.boolean() });
export const updateUserPasswordSchema = z.object({ password: staffPasswordSchema });

export const userIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const userQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  role: roleSchema.optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
