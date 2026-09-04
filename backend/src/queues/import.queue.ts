import { Queue } from "bullmq";

import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { createRedisConnection } from "../lib/redis.js";
import { processMemberImportJob, type MemberImportWorkerData } from "../modules/imports/member-import.worker.js";
import { processReport20Job, type Report20WorkerData } from "../modules/imports/report20.worker.js";

export const REPORT20_QUEUE_NAME = "report20";
export const MEMBER_IMPORT_QUEUE_NAME = "member-import";

const defaultJobOptions = {
  attempts: 1, // the processor already writes FAILED + an audit entry on error; an automatic BullMQ
  // retry would silently re-run against a job row that's no longer PENDING. Use the /rerun endpoints
  // for a deliberate retry instead.
  removeOnComplete: { age: 7 * 24 * 60 * 60 }, // keep completed job records for a week, then let BullMQ prune them
  removeOnFail: { age: 30 * 24 * 60 * 60 },
} as const;

// Without REDIS_URL (only possible outside production — see config/env.ts), there's no Redis to
// hold a BullMQ queue and no separate `npm run dev:worker` process consuming it, so a job enqueued
// the normal way would just sit at PROCESSING forever. Both processors are already self-contained
// (they catch their own errors and write FAILED to the job row — see member-import.worker.ts /
// report20.worker.ts), so it's safe to just call them directly here instead, off the current tick
// via setImmediate so the request that triggered the upload isn't blocked by the CPU-bound parse.
// Production always has REDIS_URL set (enforced in config/env.ts) and keeps using the real queue.
const inline = !env.REDIS_URL;

if (inline) {
  logger.warn("REDIS_URL is not set — running import jobs inline in this process instead of via the BullMQ queue. This is only intended for local development.");
}

// Queue producers (this file) and the BullMQ Worker consumer (worker.ts) each need their own Redis
// connection — sharing one across Queue and Worker instances is explicitly unsupported by BullMQ.
const connection = inline ? null : createRedisConnection();

const report20Queue = connection ? new Queue<Report20WorkerData>(REPORT20_QUEUE_NAME, { connection }) : null;
const memberImportQueue = connection ? new Queue<MemberImportWorkerData>(MEMBER_IMPORT_QUEUE_NAME, { connection }) : null;

function runInline<T>(label: string, data: T, process: (data: T) => Promise<void>) {
  setImmediate(() => {
    process(data).catch((error) => logger.error({ err: error }, `Unhandled error running ${label} job inline`));
  });
  return Promise.resolve();
}

export function enqueueReport20Job(data: Report20WorkerData) {
  if (!report20Queue) return runInline("report20", data, processReport20Job);
  return report20Queue.add(REPORT20_QUEUE_NAME, data, defaultJobOptions);
}

export function enqueueMemberImportJob(data: MemberImportWorkerData) {
  if (!memberImportQueue) return runInline("member-import", data, processMemberImportJob);
  return memberImportQueue.add(MEMBER_IMPORT_QUEUE_NAME, data, defaultJobOptions);
}
