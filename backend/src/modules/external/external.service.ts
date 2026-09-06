import { prisma } from "../../lib/prisma.js";

export async function lookupMemberByControllerId(controllerId: string) {
  const member = await prisma.member.findUnique({
    where: { controllerId },
    select: {
      controllerId: true,
      fullName: true,
      status: true,
      school: true,
      district: { select: { name: true, region: { select: { name: true } } } },
    },
  });

  // REMOVED members are treated as not-found for this external, lower-trust surface -- an
  // outside caller shouldn't be able to confirm someone was ever enrolled once they're off the
  // books. (User-confirmed decision: exclude REMOVED.)
  if (!member || member.status === "REMOVED") return null;

  return {
    controllerId: member.controllerId,
    fullName: member.fullName,
    status: member.status,
    school: member.school,
    district: member.district?.name ?? null,
    region: member.district?.region?.name ?? null,
  };
}
