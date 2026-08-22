import { z } from "zod";

export const requestOtpSchema = z.object({
  controllerId: z.string().trim().regex(/^\d{4,7}$/, "Controller ID must contain 4 to 7 digits"),
});

export const verifyOtpSchema = z.object({
  challengeToken: z.string().regex(/^[a-f0-9]{64}$/),
  otp: z.string().regex(/^\d{6}$/, "Enter the six-digit verification code"),
});

export const registerPhoneSchema = z.object({
  controllerId: z.string().trim().regex(/^\d{4,7}$/, "Controller ID must contain 4 to 7 digits"),
  fullName: z.string().trim().min(2).max(200),
  districtId: z.coerce.number().int().positive(),
  phone: z.string().trim().regex(/^0\d{9}$/, "Enter a valid 10-digit phone number starting with 0"),
});
