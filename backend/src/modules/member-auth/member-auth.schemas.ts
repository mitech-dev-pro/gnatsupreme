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
  dateOfBirth: z.coerce.date().max(new Date(), "Date cannot be in the future"),
  ghanaCardId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^GHA-\d{9}-\d$/, "Use the format GHA-000000000-0"),
  spouse: spouseSchema.nullable().optional(),
  beneficiaries: z
    .array(beneficiarySchema)
    .min(1, "Add at least one beneficiary")
    .max(10, "Up to 10 beneficiaries can be added"),
});
