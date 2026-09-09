import { logger } from "../../lib/logger.js";
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
  logger.info({ email, resetUrl }, "[stub] Would send member password reset email");
}
