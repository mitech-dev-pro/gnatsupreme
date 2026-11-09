import { z } from "zod";
import { staffPasswordSchema } from "../users/user.schemas.js";
import { phoneFieldSchema } from "../../lib/phone.js";
import { isCommonPassword } from "../../lib/common-passwords.js";

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

export const completeSetupSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(128),
    newPassword: staffPasswordSchema,
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: "Choose a new password -- it can't be the same as your current one",
    path: ["newPassword"],
  })
  .refine((value) => !isCommonPassword(value.newPassword), {
    message: "Choose a less easily guessed password",
    path: ["newPassword"],
  });

export const setEmailSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(128),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    confirmEmail: z.string().trim().toLowerCase().email("Enter a valid email address"),
  })
  .refine((value) => value.email === value.confirmEmail, {
    message: "Email addresses do not match",
    path: ["confirmEmail"],
  });
