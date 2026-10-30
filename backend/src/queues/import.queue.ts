import { Queue } from "bullmq";

import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { createRedisConnection } from "../lib/redis.js";
import {
  processMemberImportJob,
  type MemberImportWorkerData,
} from "../modules/imports/member-import.worker.js";
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
  logger.warn(
    "REDIS_URL is not set — running import jobs inline in this process instead of via the BullMQ queue. This is only intended for local development.",
  );
}

// Queue producers (this file) and the BullMQ Worker consumer (worker.ts) each need their own Redis
// connection — sharing one across Queue and Worker instances is explicitly unsupported by BullMQ.
// Read-only import routes must not start queue connections. Connect when work is enqueued.
let connection: ReturnType<typeof createRedisConnection> | null = null;
let report20Queue: Queue<Report20WorkerData> | null = null;
let memberImportQueue: Queue<MemberImportWorkerData> | null = null;
function reportQueue() {
  if (inline) return null;
  connection ??= createRedisConnection();
  return (report20Queue ??= new Queue<Report20WorkerData>(REPORT20_QUEUE_NAME, { connection }));
}
function memberQueue() {
  if (inline) return null;
  connection ??= createRedisConnection();
  return (memberImportQueue ??= new Queue<MemberImportWorkerData>(MEMBER_IMPORT_QUEUE_NAME, {
    connection,
  }));
}

function runInline<T>(label: string, data: T, process: (data: T) => Promise<void>) {
  setImmediate(() => {
    process(data).catch((error) =>
      logger.error({ err: error }, `Unhandled error running ${label} job inline`),
    );
  });
  return Promise.resolve();
}

export function enqueueReport20Job(data: Report20WorkerData) {
  const queue = reportQueue();
  if (!queue) return runInline("report20", data, processReport20Job);
  return queue.add(REPORT20_QUEUE_NAME, data, defaultJobOptions);
}

export function enqueueMemberImportJob(data: MemberImportWorkerData) {
  const queue = memberQueue();
  if (!queue) return runInline("member-import", data, processMemberImportJob);
  return memberQueueDeadline(queue.add(MEMBER_IMPORT_QUEUE_NAME, data, defaultJobOptions));
}

// A delayed queue write may still arrive later. The member worker's attempt timestamp and
// PROCESSING check ensure that a failed or superseded attempt cannot publish staged rows.
export function memberQueueDeadline<T>(operation: Promise<T>, timeoutMs = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Member import queue did not confirm this attempt in time")),
      timeoutMs,
    );
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
