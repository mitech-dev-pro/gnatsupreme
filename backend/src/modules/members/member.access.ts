import type { AuthenticatedUser } from "../../middleware/authenticate.js";
import { canAccessDistrict } from "../../lib/geo-scope.js";

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
    // regionId filters on the member's own regionId directly (not district.regionId) so a
    // district-less NON_TEACHING member in that region is still matched.
    return districtId ? { districtId } : regionId ? { regionId } : {};
  }

  if (user.role === "REGIONAL_ADMIN") {
    // regionId is kept in sync with district.regionId whenever a member has a district (see
    // Member.regionId in schema.prisma), so this filter covers both a member with a district
    // and a district-less NON_TEACHING member scoped directly to one of this admin's regions.
    // Always the `{ in: ... }` fragment, even when regionIds is empty -- see geo-scope.ts.
    return districtId
      ? { districtId, regionId: { in: user.regionIds } }
      : { regionId: { in: user.regionIds } };
  }

  if (user.role === "DISTRICT_ADMIN") {
    return { districtId: { in: user.districtIds } };
  }

  // Unrecognized role -- deny by default rather than fall through to an unfiltered query.
  return { districtId: { in: [] } };
}

export function memberScope(user: AuthenticatedUser) {
  return resolveMemberScope(user);
}

// Parallel to resolveMemberScope above, but for member.search.ts's raw-SQL phone-matching path,
// which needs plain id arrays rather than a Prisma `where` fragment. Kept as a discriminated
// union (never an optional-field object) so a caller can't build a scoped search with no array
// at all -- the exact fail-open shape this exists to prevent.
export type MemberSearchScope =
  | { kind: "all" }
  | { kind: "region"; regionIds: number[] }
  | { kind: "district"; districtIds: number[] };

export function resolveMemberSearchScope(
  user: AuthenticatedUser,
  filters: { regionId?: number; districtId?: number } = {},
): MemberSearchScope {
  const { regionId, districtId } = filters;

  if (user.role === "SUPER_ADMIN" || user.role === "NATIONAL_ADMIN") {
    if (districtId !== undefined) return { kind: "district", districtIds: [districtId] };
    if (regionId !== undefined) return { kind: "region", regionIds: [regionId] };
    return { kind: "all" };
  }

  if (user.role === "DISTRICT_ADMIN") {
    return { kind: "district", districtIds: user.districtIds };
  }

  if (user.role === "REGIONAL_ADMIN") {
    if (districtId !== undefined) return { kind: "district", districtIds: [districtId] };
    return { kind: "region", regionIds: user.regionIds };
  }

  // Unrecognized role -- deny by default, same as resolveMemberScope above.
  return { kind: "district", districtIds: [] };
}

export { canAccessDistrict };
