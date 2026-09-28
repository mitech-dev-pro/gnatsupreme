import type { AuthenticatedUser } from "../../middleware/authenticate.js";

// A member's regionId is kept in sync with district.regionId whenever a district is set -- it's
// only ever resolved independently for a district-less (NON_TEACHING) member. This is the single
// place that logic lives, shared by manual create/update (member.routes.ts) and bulk-import
// staging (member-import.service.ts) so the two paths can't drift apart. Pure function -- callers
// supply already-known district/region data, so this is safe to call per-row in bulk import
// without causing N+1 queries.
export function resolveMemberRegionId(
  user: AuthenticatedUser,
  input: {
    districtRegionId: number | null;
    explicitRegionId: number | null;
    ownRegionId: number | null;
  },
): { regionId: number | null; issue: string | null } {
  if (input.districtRegionId) return { regionId: input.districtRegionId, issue: null };

  if (user.role === "SUPER_ADMIN" || user.role === "NATIONAL_ADMIN") {
    return input.explicitRegionId
      ? { regionId: input.explicitRegionId, issue: null }
      : { regionId: null, issue: "Select a region" };
  }

  // REGIONAL_ADMIN / DISTRICT_ADMIN: always their own region, never overridable by input. In
  // practice DISTRICT_ADMIN always has districtRegionId set (their district is always forced),
  // so this branch is REGIONAL_ADMIN's real path and DISTRICT_ADMIN's defensive fallback.
  return input.ownRegionId
    ? { regionId: input.ownRegionId, issue: null }
    : { regionId: null, issue: "Your account has no region assigned" };
}
