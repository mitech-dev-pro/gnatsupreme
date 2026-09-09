import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { type AuthenticatedUser } from "../../middleware/authenticate.js";
import { memberScope } from "../members/member.access.js";
export function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
export async function accessibleMember(id: number, currentUser: AuthenticatedUser) {
  return prisma.member.findFirst({
    where: { id, ...memberScope(currentUser) },
    include: { district: { select: { regionId: true } }, beneficiaries: true },
  });
}
export async function ghanaCardConflict(
  ghanaCardId: string | null | undefined,
  memberId: number,
  spouseId?: number,
) {
  if (!ghanaCardId) return false;
  const [member, spouse] = await Promise.all([
    prisma.member.findFirst({
      where: { ghanaCardId, id: { not: memberId } },
      select: { id: true },
    }),
    prisma.spouse.findFirst({
      where: { ghanaCardId, ...(spouseId ? { id: { not: spouseId } } : {}) },
      select: { id: true },
    }),
  ]);
  return Boolean(member || spouse);
}
