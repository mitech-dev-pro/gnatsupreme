import { prisma } from "../../lib/prisma.js";
import type { AuthenticatedUser } from "../../middleware/authenticate.js";

// Resolves the Prisma `where` scope a user is permitted to query members within, optionally
// narrowed further by an explicit region/district filter (e.g. from the Members list toolbar).
// Scoped roles (REGIONAL_ADMIN, DISTRICT_ADMIN) can never widen past their fixed scope this way —
// an out-of-scope regionId/districtId yields zero rows rather than a leak, since the filter is
// ANDed with their own fixed scope rather than replacing it.
export function resolveMemberScope(
  user: AuthenticatedUser,
  filters: { regionId?: number; districtId?: number } = {},
) {
  const { regionId, districtId } = filters;

  if (user.role === "SUPER_ADMIN" || user.role === "NATIONAL_ADMIN") {
    return districtId ? { districtId } : regionId ? { district: { regionId } } : {};
  }

  if (user.role === "REGIONAL_ADMIN") {
    const ownRegionId = user.regionId ?? -1;
    return districtId
      ? { districtId, district: { regionId: ownRegionId } }
      : { district: { regionId: ownRegionId } };
  }

  // DISTRICT_ADMIN: the only remaining UserRole value — fixed regardless of any query params.
  return { districtId: user.districtId ?? -1 };
}

export function memberScope(user: AuthenticatedUser) {
  return resolveMemberScope(user);
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
