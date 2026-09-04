import { Redis } from "ioredis";

import { env } from "../config/env.js";
import { logger } from "./logger.js";

// A shared connection for BullMQ Queue instances (job producers). BullMQ workers open their own
// separate connection per instance rather than reusing this one — see worker.ts.
// maxRetriesPerRequest: null is required by BullMQ; without it, ioredis gives up retrying a command
// after 20 attempts instead of blocking indefinitely, which BullMQ's blocking commands need.
export function createRedisConnection() {
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL is not configured — this call path requires Redis and should not run without it");
  }
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on("error", (error: Error) =>
    logger.error({ err: error }, "Redis connection error"),
  );
  return connection;
}
