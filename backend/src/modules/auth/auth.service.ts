import type { Prisma } from "../../generated/prisma/client.js";
import { logger } from "../../lib/logger.js";
import { assertEmailAvailable, tempPasswordExpiryInstant } from "../../lib/account-setup.js";
import { sendStaffEmailVerificationEmail } from "./auth.profile.js";
import {
  createPasswordResetToken,
  emailVerificationTokenExpiresAt,
  hashPasswordResetToken,
} from "./auth.tokens.js";

// Shared by complete-setup (self-service) and the admin pending-email path on PATCH
// /users/:id -- both need the identical sequence: check availability (releasing any stale claim
// first), close out any link from a previous run before issuing a new one (the fix for an old
// link confirming whatever's pending *now* instead of what it was issued for), and set
// pendingEmail/pendingEmailExpiresAt. Called inside the caller's own transaction; returns the
// raw (unhashed) token for the caller to send after commit.
export async function issuePendingEmail(
  tx: Prisma.TransactionClient,
  userId: number,
  email: string,
): Promise<string> {
  await assertEmailAvailable(tx, email, { excludeUserId: userId });
  await tx.userEmailVerificationToken.deleteMany({ where: { userId } });
  const token = createPasswordResetToken();
  await tx.userEmailVerificationToken.create({
    data: {
      userId,
      email,
      tokenHash: hashPasswordResetToken(token),
      expiresAt: emailVerificationTokenExpiresAt(),
    },
  });
  await tx.user.update({
    where: { id: userId },
    data: { pendingEmail: email, pendingEmailExpiresAt: tempPasswordExpiryInstant() },
  });
  return token;
}

// Fire-and-forget, called after the transaction that issued the token commits -- the DB write
// already succeeded, so a provider failure here is logged, not surfaced as a failed response; a
// re-run of setup (or another admin edit) reissues the link anyway.
export function sendPendingEmailVerification(
  frontendOrigin: string,
  userId: number,
  email: string,
  token: string,
) {
  const confirmUrl = `${frontendOrigin}/confirm-email?token=${token}`;
  sendStaffEmailVerificationEmail(email, confirmUrl).catch((error: unknown) => {
    logger.error({ err: error, userId }, "Failed to send staff email verification email");
  });
}
