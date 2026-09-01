import { env } from "../config/env.js";
import { cacheKey, withCache } from "./cache.js";

export function cachedCount(namespace: string, filters: unknown, load: () => Promise<number>) {
  return withCache(cacheKey(`count:${namespace}`, filters), env.READ_CACHE_TTL_SECONDS, load);
}
