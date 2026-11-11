import type { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../middleware/error-handler.js";

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
