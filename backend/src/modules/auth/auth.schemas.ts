import { z } from "zod";
import { staffPasswordSchema } from "../users/user.schemas.js";
import { phoneFieldSchema } from "../../lib/phone.js";

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address").optional(),
    phone: phoneFieldSchema,
    password: z.string().min(1, "Password is required").max(128),
  })
  .refine((value) => Boolean(value.email) !== Boolean(value.phone), {
    message: "Provide an email or a phone number",
    path: ["email"],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: staffPasswordSchema,
});

export const completeSetupSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128),
  newPassword: staffPasswordSchema.optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").optional(),
});

export const confirmEmailSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
