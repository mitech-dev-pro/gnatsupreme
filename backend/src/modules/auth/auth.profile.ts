import { emailProvider } from "../notifications/email.provider.js";

export async function sendStaffPasswordResetEmail(email: string, resetUrl: string) {
  await emailProvider.send({
    to: email,
    subject: "Reset your GNAT Supreme staff password",
    text: `We received a request to reset your GNAT Supreme staff account password.\n\nReset your password: ${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<p>We received a request to reset your GNAT Supreme staff account password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
  });
}

// Sent to the OLD address whenever set-email replaces an already-set email with a new one --
// lets the real account owner notice if someone else took over, since the old address is no
// longer the password-reset destination after this.
export async function sendStaffEmailChangedNotice(oldEmail: string, newEmail: string) {
  await emailProvider.send({
    to: oldEmail,
    subject: "Your GNAT Supreme staff login email was changed",
    text: `The login email for your GNAT Supreme staff account was changed from this address to ${newEmail}.\n\nIf you made this change, no action is needed. If you did not, contact an administrator immediately.`,
    html: `<p>The login email for your GNAT Supreme staff account was changed from this address to ${newEmail}.</p><p>If you made this change, no action is needed. If you did not, contact an administrator immediately.</p>`,
  });
}
