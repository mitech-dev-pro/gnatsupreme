import { emailProvider } from "../notifications/email.provider.js";

export function publicMember(member: {
  id: number;
  controllerId: string;
  fullName: string;
  status: string;
}) {
  return {
    id: member.id,
    controllerId: member.controllerId,
    fullName: member.fullName,
    status: member.status,
  };
}
export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  await emailProvider.send({
    to: email,
    subject: "Reset your GNAT Supreme password",
    text: `We received a request to reset your GNAT Supreme member portal password.\n\nReset your password: ${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<p>We received a request to reset your GNAT Supreme member portal password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
  });
}
