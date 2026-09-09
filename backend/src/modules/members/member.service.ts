import { prisma } from "../../lib/prisma.js";
import { type AuthenticatedUser } from "../../middleware/authenticate.js";
import { memberScope } from "./member.access.js";
export const memberInclude = {
  district: {
    select: { id: true, name: true, regionId: true, region: { select: { id: true, name: true } } },
  },
  spouse: { select: { id: true, fullName: true, ghanaCardId: true } },
  beneficiaries: {
    orderBy: { id: "asc" as const },
    select: {
      id: true,
      fullName: true,
      relationship: true,
      dateOfBirth: true,
      trusteeName: true,
      trusteeGhanaCardId: true,
    },
  },
  createdBy: { select: { id: true, fullName: true } },
} as const;
export const memberListInclude = {
  district: { select: { id: true, name: true, region: { select: { id: true, name: true } } } },
  spouse: { select: { fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { beneficiaries: true } },
} as const;
export function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
export function reasonLabel(reason: string) {
  const labels: Record<string, string> = {
    DEATH: "death",
    DISABILITY: "disability",
    RETIREMENT: "retirement",
    RESIGNATION: "resignation",
    OTHER: "other",
  };
  return labels[reason] ?? reason.toLowerCase();
}
export async function findAccessibleMember(id: number, user: AuthenticatedUser) {
  return prisma.member.findFirst({
    where: { id, ...memberScope(user) },
    include: memberInclude,
  });
}
export async function ghanaCardIsUsed(
  ghanaCardId: string | null | undefined,
  exclusions: { memberId?: number; spouseId?: number } = {},
) {
  if (!ghanaCardId) return false;
  const [member, spouse] = await Promise.all([
    prisma.member.findFirst({
      where: { ghanaCardId, ...(exclusions.memberId ? { id: { not: exclusions.memberId } } : {}) },
      select: { id: true },
    }),
    prisma.spouse.findFirst({
      where: { ghanaCardId, ...(exclusions.spouseId ? { id: { not: exclusions.spouseId } } : {}) },
      select: { id: true },
    }),
  ]);
  return Boolean(member || spouse);
}
