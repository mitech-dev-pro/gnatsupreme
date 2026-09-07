import { prisma } from "../../lib/prisma.js";

export async function lookupMemberByControllerId(controllerId: string) {
  const member = await prisma.member.findUnique({
    where: { controllerId },
    select: {
      controllerId: true,
      fullName: true,
      status: true,
      school: true,
      dateOfBirth: true,
      ghanaCardId: true,
      phone: true,
      phoneVerifiedAt: true,
      email: true,
      district: { select: { name: true, region: { select: { name: true } } } },
      spouse: {
        select: { fullName: true, dateOfBirth: true, ghanaCardId: true },
      },
    },
  });

  // REMOVED members are treated as not-found for this external, lower-trust surface -- an
  // outside caller shouldn't be able to confirm someone was ever enrolled once they're off the
  // books.
  if (!member || member.status === "REMOVED") return null;

  return {
    controllerId: member.controllerId,
    fullName: member.fullName,
    status: member.status,
    school: member.school,
    dateOfBirth: member.dateOfBirth,
    ghanaCardId: member.ghanaCardId,
    phone: member.phone,
    phoneVerified: member.phoneVerifiedAt !== null,
    email: member.email,
    district: member.district?.name ?? null,
    region: member.district?.region?.name ?? null,
    spouse: member.spouse
      ? {
          fullName: member.spouse.fullName,
          dateOfBirth: member.spouse.dateOfBirth,
          ghanaCardId: member.spouse.ghanaCardId,
        }
      : null,
  };
}
