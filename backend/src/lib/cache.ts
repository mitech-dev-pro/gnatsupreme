import { createHash } from "node:crypto";

import { Redis } from "ioredis";

import { env } from "../config/env.js";
import { logger } from "./logger.js";

const cache = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 1_000,
  commandTimeout: 1_000,
});

let connected = false;
let connecting: Promise<void> | null = null;
let nextRetryAt = 0;
let lastWarningAt = 0;
const inFlight = new Map<string, Promise<unknown>>();
const metrics = { hits: 0, misses: 0, errors: 0, writes: 0, invalidations: 0 };

cache.on("ready", () => { connected = true; });
cache.on("close", () => { connected = false; });
cache.on("error", () => { connected = false; });

function warnOnce(error: unknown, operation: string) {
  metrics.errors += 1;
  connected = false;
  nextRetryAt = Date.now() + 30_000;
  if (Date.now() - lastWarningAt < 60_000) return;
  lastWarningAt = Date.now();
  logger.warn({ err: error, operation }, "Redis cache unavailable; using PostgreSQL fallback");
}

async function ensureConnection() {
  if (connected || cache.status === "ready") return true;
  if (Date.now() < nextRetryAt) return false;
  if (!connecting) {
    connecting = cache.connect().finally(() => { connecting = null; });
  }
  try {
    await connecting;
    connected = true;
    nextRetryAt = 0;
    return true;
  } catch (error) {
    warnOnce(error, "connect");
    return false;
  }
}

export function cacheKey(prefix: string, value: unknown) {
  const stable = JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || item instanceof Date) return item;
    return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
  });
  return `${prefix}:${createHash("sha256").update(stable).digest("hex").slice(0, 24)}`;
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  if (!(await ensureConnection())) return null;
  try {
    const value = await cache.get(key);
    if (value === null) { metrics.misses += 1; return null; }
    metrics.hits += 1;
    return JSON.parse(value) as T;
  } catch (error) {
    warnOnce(error, "get");
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number) {
  if (!(await ensureConnection())) return;
  try {
    const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(ttlSeconds * 0.1)));
    await cache.set(key, JSON.stringify(value), "EX", ttlSeconds + jitter);
    metrics.writes += 1;
  } catch (error) {
    warnOnce(error, "set");
  }
}

export async function withCache<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const cached = await getCachedJson<T>(key);
  if (cached !== null) return cached;

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = (async () => {
    const lockKey = `lock:${key}`;
    const lockToken = createHash("sha256").update(`${process.pid}:${Date.now()}:${Math.random()}`).digest("hex");
    let ownsLock = false;
    if (await ensureConnection()) {
      try { ownsLock = (await cache.set(lockKey, lockToken, "PX", 5_000, "NX")) === "OK"; }
      catch (error) { warnOnce(error, "lock"); }
    }

    if (!ownsLock && connected) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const populated = await getCachedJson<T>(key);
        if (populated !== null) return populated;
      }
    }

    try {
      const value = await load();
      await setCachedJson(key, value, ttlSeconds);
      return value;
    } finally {
      if (ownsLock) {
        await cache.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          lockKey,
          lockToken,
        ).catch((error: unknown) => warnOnce(error, "unlock"));
      }
    }
  })().finally(() => { inFlight.delete(key); });
  inFlight.set(key, pending);
  return pending;
}

export async function deleteCacheKey(...keys: string[]) {
  if (!keys.length || !(await ensureConnection())) return;
  try {
    await cache.del(...keys);
    metrics.invalidations += keys.length;
  } catch (error) {
    warnOnce(error, "delete");
  }
}

export async function deleteCachePrefix(prefix: string) {
  if (!(await ensureConnection())) return;
  try {
    let cursor = "0";
    do {
      const [next, keys] = await cache.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
      cursor = next;
      if (keys.length) {
        await cache.del(...keys);
        metrics.invalidations += keys.length;
      }
    } while (cursor !== "0");
  } catch (error) {
    warnOnce(error, "delete-prefix");
  }
}

export function cacheMetrics() {
  return { ...metrics, connected };
}

export async function cachePing() {
  if (!(await ensureConnection())) return false;
  try { return (await cache.ping()) === "PONG"; }
  catch (error) { warnOnce(error, "ping"); return false; }
}

export async function closeCache() {
  if (cache.status === "ready" || cache.status === "connecting") await cache.quit().catch(() => cache.disconnect());
  else cache.disconnect();
}
