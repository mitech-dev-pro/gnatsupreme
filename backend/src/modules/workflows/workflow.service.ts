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
