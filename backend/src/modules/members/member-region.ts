import type { AuthenticatedUser } from "../../middleware/authenticate.js";

// A member's regionId is kept in sync with district.regionId whenever a district is set -- it's
// only ever resolved independently for a district-less (NON_TEACHING) member. This is the single
// place that logic lives, shared by manual create/update (member.routes.ts) and bulk-import
// staging (member-import.service.ts) so the two paths can't drift apart. Pure function -- callers
// supply already-known district/region data, so this is safe to call per-row in bulk import
// without causing N+1 queries.
//
// `existingRegionId` is what distinguishes create from update -- callers pass the member's
// current regionId on update, `null` on create. There's no existing record to fall back to on
// create, so a multi-region admin must always resolve the ambiguity explicitly in that case.
export function resolveMemberRegionId(
  user: AuthenticatedUser,
  input: {
    districtRegionId: number | null;
    explicitRegionId: number | null;
    existingRegionId: number | null;
    ownRegionIds: number[];
  },
): { regionId: number | null; issue: string | null } {
  if (input.districtRegionId) return { regionId: input.districtRegionId, issue: null };

  if (user.role === "SUPER_ADMIN" || user.role === "NATIONAL_ADMIN") {
    if (input.explicitRegionId) return { regionId: input.explicitRegionId, issue: null };
    if (input.existingRegionId) return { regionId: input.existingRegionId, issue: null };
    return { regionId: null, issue: "Select a region" };
  }

  // REGIONAL_ADMIN / DISTRICT_ADMIN: must stay within the admin's own regions. In practice
  // DISTRICT_ADMIN always has districtRegionId set (their district is always forced on create,
  // and update's canAccessDistrict gate keeps any supplied district in scope), so this is
  // REGIONAL_ADMIN's real path and DISTRICT_ADMIN's defensive fallback.
  if (input.explicitRegionId !== null) {
    return input.ownRegionIds.includes(input.explicitRegionId)
      ? { regionId: input.explicitRegionId, issue: null }
      : { regionId: null, issue: "Select which of your regions this member belongs to" };
  }

  if (input.existingRegionId !== null && input.ownRegionIds.includes(input.existingRegionId)) {
    return { regionId: input.existingRegionId, issue: null };
  }

  if (input.ownRegionIds.length === 1) {
    return { regionId: input.ownRegionIds[0]!, issue: null };
  }

  if (input.ownRegionIds.length === 0) {
    return { regionId: null, issue: "Your account has no region assigned" };
  }

  return { regionId: null, issue: "Select which of your regions this member belongs to" };
}
