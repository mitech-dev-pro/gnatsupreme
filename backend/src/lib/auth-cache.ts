import { deleteCacheKey, deleteCachePrefix } from "./cache.js";

// v2: cached payload shape changed from singular regionId/districtId to regionIds/districtIds
// arrays (see AuthenticatedUser) -- the namespace bump forces every pre-deploy cached session to
// miss and re-fetch under the new shape instead of serving a stale singular-id payload.
export const staffAuthCacheKey = (userId: number) => `auth:staff:v2:${userId}`;
export const memberAuthCacheKey = (memberId: number) => `auth:member:${memberId}`;

export const invalidateStaffAuth = (userId: number) => deleteCacheKey(staffAuthCacheKey(userId));
export const invalidateMemberAuth = (memberId: number) =>
  deleteCacheKey(memberAuthCacheKey(memberId));
export const invalidateAllMemberAuth = () => deleteCachePrefix("auth:member:");
