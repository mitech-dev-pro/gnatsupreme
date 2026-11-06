import { prisma } from "./prisma.js";
import type { AuthenticatedUser } from "../middleware/authenticate.js";

// Shared region/district scoping for REGIONAL_ADMIN/DISTRICT_ADMIN, now that each admin holds an
// *array* of regions/districts instead of one each. An empty array is truthy in JS (unlike the
// old singular `null`), so a naive `if (user.regionIds?.length)` guard would silently skip the
// filter and fall through to an unfiltered query -- the opposite of what a scoped role needs.
// `{ in: [] }` already matches nothing under Prisma's own semantics (confirmed with a dedicated
// test in geo-scope.test.ts) -- always return the `{ in: ... }` fragment, never branch on
// array length.
export type GeoScopeWhere =
  | { regionId: { in: number[] } }
  | { districtId: { in: number[] } }
  | Record<string, never>;

export function geoScopeWhere(user: AuthenticatedUser): GeoScopeWhere {
  switch (user.role) {
    case "SUPER_ADMIN":
    case "NATIONAL_ADMIN":
      return {};
    case "REGIONAL_ADMIN":
      return { regionId: { in: user.regionIds } };
    case "DISTRICT_ADMIN":
      return { districtId: { in: user.districtIds } };
    default:
      // Deny-by-default for any role this helper doesn't recognize -- matches nothing, never
      // falls through to the unfiltered branch above.
      return { districtId: { in: [] } };
  }
}

// Array-aware replacement for the old `user.districtId === districtId` / single-region check.
// Validates a single candidate district against a (possibly multi-scope) admin's own scope --
// e.g. a supplied districtId on member create/update, or assigning a district to an existing
// district-less member.
export async function canAccessDistrict(
  user: AuthenticatedUser,
  districtId: number,
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN" || user.role === "NATIONAL_ADMIN") return true;
  if (user.role === "DISTRICT_ADMIN") return user.districtIds.includes(districtId);
  if (user.role === "REGIONAL_ADMIN") {
    const district = await prisma.district.findUnique({
      where: { id: districtId },
      select: { regionId: true },
    });
    return district !== null && user.regionIds.includes(district.regionId);
  }
  return false;
}
