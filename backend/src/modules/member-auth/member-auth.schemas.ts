import { z } from "zod";

export const requestOtpSchema = z.object({
  controllerId: z.string().trim().regex(/^\d{9}$/, "Controller ID must contain exactly 9 digits"),
});

export const verifyOtpSchema = z.object({
  challengeToken: z.string().regex(/^[a-f0-9]{64}$/),
  otp: z.string().regex(/^\d{6}$/, "Enter the six-digit verification code"),
});
