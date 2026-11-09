import { logger } from "../../lib/logger.js";
import { sendStaffEmailChangedNotice } from "./auth.profile.js";

// Fire-and-forget, called after the transaction that changed a user's email commits -- the DB
// write already succeeded, so a provider failure here is logged, not surfaced as a failed
// response. Only called when replacing an already-set email, never on a first-set (nothing to
// notify the "old" address about then).
export function notifyStaffEmailChanged(userId: number, oldEmail: string, newEmail: string) {
  sendStaffEmailChangedNotice(oldEmail, newEmail).catch((error: unknown) => {
    logger.error({ err: error, userId }, "Failed to send staff email-changed notice");
  });
}
