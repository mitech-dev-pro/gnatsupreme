import type { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../middleware/error-handler.js";

// Shared by every write that extends User.tempPasswordExpiresAt -- however an account got
// there, it has 7 days of reachability from the last time it was armed. Deliberately short:
// the simplified onboarding scheme trades a random-word temp password's entropy for
// typability (see the account-states plan), so a short window matters more here than it did
// for the old per-account random-character passwords.
export const TEMP_PASSWORD_TTL_DAYS = 7;

export function tempPasswordExpiryInstant(): Date {
  return new Date(Date.now() + TEMP_PASSWORD_TTL_DAYS * 24 * 60 * 60 * 1_000);
}

// User.tempPasswordExpiresAt stores the expiry instant directly (not an issue time) -- every
// caller does a plain isExpired(column), never TTL math at the call site. A missing expiry
// reads as already-expired (fails closed).
export function isExpired(at: Date | null): boolean {
  return at === null || at.getTime() <= Date.now();
}

// Called inside the caller's own transaction by every write path that sets User.email
// (self-service set-email, admin update) -- no "pending" concept exists anymore, so this is
// just a plain uniqueness check, not a stale-claim release.
export async function assertEmailAvailable(
  tx: Prisma.TransactionClient,
  email: string,
  options: { excludeUserId?: number } = {},
): Promise<void> {
  const conflict = await tx.user.findFirst({
    where: {
      email,
      ...(options.excludeUserId ? { id: { not: options.excludeUserId } } : {}),
    },
    select: { id: true },
  });
  if (conflict) {
    throw new AppError(409, "This email address is already in use", "EMAIL_ALREADY_IN_USE");
  }
}

// Called inside the same transaction as every write that changes or clears a user's email
// (self-service set-email, admin PATCH /users/:id, admin password reset) -- an unconsumed
// reset link already sent to the old address must stop working the instant the email
// changes, or whoever controls that old address can reset the password straight back. A
// single shared helper, rather than repeating this deleteMany at each call site, is what
// keeps a future fourth call site from missing it.
export async function invalidatePasswordResetTokens(
  tx: Prisma.TransactionClient,
  userId: number,
): Promise<void> {
  await tx.userPasswordResetToken.deleteMany({ where: { userId, consumedAt: null } });
}
