import { Queue } from "bullmq";

import { createRedisConnection } from "../lib/redis.js";
import type { MemberImportWorkerData } from "../modules/imports/member-import.worker.js";
import type { Report20WorkerData } from "../modules/imports/report20.worker.js";

// Queue producers (this file) and the BullMQ Worker consumer (worker.ts) each need their own Redis
// connection — sharing one across Queue and Worker instances is explicitly unsupported by BullMQ.
const connection = createRedisConnection();

export const REPORT20_QUEUE_NAME = "report20";
export const MEMBER_IMPORT_QUEUE_NAME = "member-import";

export const report20Queue = new Queue<Report20WorkerData>(REPORT20_QUEUE_NAME, { connection });
export const memberImportQueue = new Queue<MemberImportWorkerData>(MEMBER_IMPORT_QUEUE_NAME, { connection });

const defaultJobOptions = {
  attempts: 1, // the processor already writes FAILED + an audit entry on error; an automatic BullMQ
  // retry would silently re-run against a job row that's no longer PENDING. Use the /rerun endpoints
  // for a deliberate retry instead.
  removeOnComplete: { age: 7 * 24 * 60 * 60 }, // keep completed job records for a week, then let BullMQ prune them
  removeOnFail: { age: 30 * 24 * 60 * 60 },
} as const;

export function enqueueReport20Job(data: Report20WorkerData) {
  return report20Queue.add(REPORT20_QUEUE_NAME, data, defaultJobOptions);
}

export function enqueueMemberImportJob(data: MemberImportWorkerData) {
  return memberImportQueue.add(MEMBER_IMPORT_QUEUE_NAME, data, defaultJobOptions);
}
