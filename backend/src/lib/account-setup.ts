import type { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../middleware/error-handler.js";

// Shared by every write that extends User.tempPasswordExpiresAt/pendingEmailExpiresAt -- see the
// account-states table in the phone-login plan. One constant for both columns: however an
// account got there, it has 14 days of reachability from the last time its credential state
// changed, deliberately decoupled from the shorter-lived verification *link* TTL
// (env.STAFF_EMAIL_VERIFICATION_TTL_MINUTES).
export const TEMP_PASSWORD_TTL_DAYS = 14;

export function tempPasswordExpiryInstant(): Date {
  return new Date(Date.now() + TEMP_PASSWORD_TTL_DAYS * 24 * 60 * 60 * 1_000);
}

// Both User.tempPasswordExpiresAt and User.pendingEmailExpiresAt store the expiry instant
// directly (not an issue time) -- every caller does a plain isExpired(column), never TTL math at
// the call site. A missing expiry reads as already-expired (fails closed), which is what backs
// up the "a confirmed email can never be cleared back to null" guard in user.routes.ts: even if
// that invariant were somehow violated, a null pendingEmailExpiresAt still closes phone login
// rather than reopening it.
export function isExpired(at: Date | null): boolean {
  return at === null || at.getTime() <= Date.now();
}

// Called inside the caller's own transaction by every write path that sets User.email or
// User.pendingEmail (admin create, admin update, complete-setup) -- uniqueness has to be checked
// across both columns together, since the DB only enforces uniqueness within each column
// separately. Releases a stale (expired) pendingEmail claim first, in the same transaction,
// before checking -- the read-side check alone isn't enough, since an expired-but-still-present
// row would still hit the DB's own unique constraint on the eventual write otherwise.
export async function assertEmailAvailable(
  tx: Prisma.TransactionClient,
  email: string,
  options: { excludeUserId?: number } = {},
): Promise<void> {
  await tx.user.updateMany({
    where: { pendingEmail: email, pendingEmailExpiresAt: { lte: new Date() } },
    data: { pendingEmail: null, pendingEmailExpiresAt: null },
  });

  const conflict = await tx.user.findFirst({
    where: {
      OR: [{ email }, { pendingEmail: email }],
      ...(options.excludeUserId ? { id: { not: options.excludeUserId } } : {}),
    },
    select: { id: true },
  });
  if (conflict) {
    throw new AppError(409, "This email address is already in use", "EMAIL_ALREADY_IN_USE");
  }
}
