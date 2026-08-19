import { prisma } from "../../lib/prisma.js";
import type { AuthenticatedUser } from "../../middleware/authenticate.js";

export function memberScope(user: AuthenticatedUser) {
  if (user.role === "REGIONAL_ADMIN") {
    return { district: { regionId: user.regionId ?? -1 } };
  }
  if (user.role === "DISTRICT_ADMIN") {
    return { districtId: user.districtId ?? -1 };
  }
  return {};
}

export async function canAccessDistrict(user: AuthenticatedUser, districtId: number) {
  if (user.role === "SUPER_ADMIN" || user.role === "NATIONAL_ADMIN") return true;
  if (user.role === "DISTRICT_ADMIN") return user.districtId === districtId;

  const district = await prisma.district.findUnique({
    where: { id: districtId },
    select: { regionId: true },
  });
  return district?.regionId === user.regionId;
}
