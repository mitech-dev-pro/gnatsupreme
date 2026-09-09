import { z } from "zod";
import { beneficiarySchema, spouseSchema } from "../members/member.schemas.js";

const controllerIdSchema = z
  .string()
  .trim()
  .regex(/^\d{4,7}$/, "Controller ID must contain 4 to 7 digits");

export const memberPasswordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters")
  .max(128);

export const loginSchema = z.object({
  controllerId: controllerIdSchema,
  password: z.string().min(1, "Enter your password"),
});

export const forgotPasswordSchema = z.object({
  controllerId: controllerIdSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: memberPasswordSchema,
});

export const setupAccountSchema = z.object({
  controllerId: controllerIdSchema,
  fullName: z.string().trim().min(2).max(200),
  districtId: z.coerce.number().int().positive().optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: memberPasswordSchema,
});

export const memberLookupSchema = z.object({
  controllerId: controllerIdSchema,
});

export const onboardingDetailsSchema = z.object({
  ghanaCardId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^GHA-\d{9}-\d$/, "Use the format GHA-000000000-0"),
  spouse: spouseSchema.nullable().optional(),
  // No .min(1) here -- a member enrolled by staff may already have beneficiaries on file, and
  // this endpoint only ever runs for a member reaching this step because *some* completion item
  // (often just the Ghana Card ID) is missing, not necessarily the beneficiary. Whether at least
  // one beneficiary exists in total (existing + newly submitted) is checked in the route handler,
  // where the existing count is actually known.
  beneficiaries: z.array(beneficiarySchema).max(10, "Up to 10 beneficiaries can be added"),
});
