import { emailProvider } from "../notifications/email.provider.js";

export async function sendStaffPasswordResetEmail(email: string, resetUrl: string) {
  await emailProvider.send({
    to: email,
    subject: "Reset your GNAT Supreme staff password",
    text: `We received a request to reset your GNAT Supreme staff account password.\n\nReset your password: ${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<p>We received a request to reset your GNAT Supreme staff account password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
  });
}
