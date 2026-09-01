import { deleteCacheKey, deleteCachePrefix } from "./cache.js";

export const staffAuthCacheKey = (userId: number) => `auth:staff:${userId}`;
export const memberAuthCacheKey = (memberId: number) => `auth:member:${memberId}`;

export const invalidateStaffAuth = (userId: number) => deleteCacheKey(staffAuthCacheKey(userId));
export const invalidateMemberAuth = (memberId: number) => deleteCacheKey(memberAuthCacheKey(memberId));
export const invalidateAllMemberAuth = () => deleteCachePrefix("auth:member:");
