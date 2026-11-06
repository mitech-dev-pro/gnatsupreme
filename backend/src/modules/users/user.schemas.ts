import { z } from "zod";
import { phoneFieldSchema } from "../../lib/phone.js";

const roleSchema = z.enum(["SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN", "DISTRICT_ADMIN"]);

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
  // Nullable -- a GNAT account created with only a phone number has no email yet. See
  // User.setupRequired/phone/pendingEmail and the account-states table in the phone-login plan.
  email: z.string().trim().toLowerCase().email().nullable().optional(),
  phone: phoneFieldSchema,
  role: roleSchema,
  // Deduplicated here, not left to the caller -- a create/update with a repeated id must never
  // be mistaken for "not found" when resolveGeographicScope compares input length against the
  // number of matching rows.
  regionIds: z
    .array(z.coerce.number().int().positive())
    .transform((ids) => [...new Set(ids)])
    .optional(),
  districtIds: z
    .array(z.coerce.number().int().positive())
    .transform((ids) => [...new Set(ids)])
    .optional(),
};

export const createUserSchema = z
  .object({ ...staffFields, password: staffPasswordSchema })
  .refine((value) => Boolean(value.email) || Boolean(value.phone), {
    message: "Provide an email or a phone number",
    path: ["email"],
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
