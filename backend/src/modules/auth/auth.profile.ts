import { emailProvider } from "../notifications/email.provider.js";

export async function sendStaffPasswordResetEmail(email: string, resetUrl: string) {
  await emailProvider.send({
    to: email,
    subject: "Reset your GNAT Supreme staff password",
    text: `We received a request to reset your GNAT Supreme staff account password.\n\nReset your password: ${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<p>We received a request to reset your GNAT Supreme staff account password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
  });
}

export async function sendStaffEmailVerificationEmail(email: string, confirmUrl: string) {
  await emailProvider.send({
    to: email,
    subject: "Confirm your GNAT Supreme staff email address",
    text: `Confirm this email address for your GNAT Supreme staff account.\n\nConfirm your email: ${confirmUrl}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<p>Confirm this email address for your GNAT Supreme staff account.</p><p><a href="${confirmUrl}">Confirm your email</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
  });
}
