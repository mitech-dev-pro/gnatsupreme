import "dotenv/config";

import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import pg from "pg";

const { Pool } = pg;
const configuration = {
  DB_POOL_MAX: Number(process.env.DB_POOL_MAX ?? 5),
  DB_CONNECTION_TIMEOUT_MS: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 5000),
  DB_IDLE_TIMEOUT_MS: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000),
  AUTH_CACHE_TTL_SECONDS: Number(process.env.AUTH_CACHE_TTL_SECONDS ?? 30),
  READ_CACHE_TTL_SECONDS: Number(process.env.READ_CACHE_TTL_SECONDS ?? 60),
  SLOW_REQUEST_THRESHOLD_MS: Number(process.env.SLOW_REQUEST_THRESHOLD_MS ?? 750),
};

if (!process.env.DATABASE_URL || !process.env.REDIS_URL) throw new Error("DATABASE_URL and REDIS_URL are required");
for (const [name, value] of Object.entries(configuration)) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: configuration.DB_POOL_MAX,
  connectionTimeoutMillis: configuration.DB_CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: configuration.DB_IDLE_TIMEOUT_MS,
  application_name: "gnatsupreme-performance-verifier",
});
const redis = new Redis(process.env.REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 1_000,
  commandTimeout: 1_000,
});

try {
  const failures = [];
  const database = await pool.query(`
    SELECT current_setting('max_connections')::int AS max_connections,
           COUNT(*)::int AS active_connections
    FROM pg_stat_activity
    WHERE state IS NOT NULL
    GROUP BY current_setting('max_connections')
  `);
  const extension = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS enabled",
  );
  if (!extension.rows[0]?.enabled) failures.push("pg_stat_statements is not enabled; follow deployment.md before production rollout");

  await redis.connect();
  const key = `gnat:verify:${randomUUID()}`;
  await redis.set(key, "ok", "EX", 10);
  if ((await redis.get(key)) !== "ok") throw new Error("Redis cache round-trip failed");
  await redis.del(key);

  const db = database.rows[0];
  const usagePercent = db.max_connections ? (db.active_connections / db.max_connections) * 100 : 0;
  if (usagePercent >= 60) failures.push(`PostgreSQL connection usage is ${usagePercent.toFixed(1)}%, above the 60% target`);
  console.log(JSON.stringify({ configuration, postgres: { ...db, usagePercent: Number(usagePercent.toFixed(1)) }, redis: "available", pgStatStatements: extension.rows[0]?.enabled ? "enabled" : "missing" }, null, 2));
  if (failures.length) throw new Error(failures.join("; "));
} finally {
  redis.disconnect();
  await pool.end();
}
