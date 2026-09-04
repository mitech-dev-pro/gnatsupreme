import { Worker } from "bullmq";

import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { createRedisConnection } from "./lib/redis.js";
import { processMemberImportJob } from "./modules/imports/member-import.worker.js";
import { processReport20Job } from "./modules/imports/report20.worker.js";
import { MEMBER_IMPORT_QUEUE_NAME, REPORT20_QUEUE_NAME } from "./queues/import.queue.js";

// BullMQ renews a job's lock via a timer running in this same process. ExcelJS's XLSX parsing
// (workbook.xlsx.readFile, used by both parseReport20 and stageMemberImport) runs largely
// synchronously despite being promise-wrapped, and for a file with tens of thousands of rows can
// block the event loop for well over BullMQ's 30s default lock duration -- long enough that the
// lock-renewal timer never gets a turn to fire. BullMQ then (correctly, given its 30s assumption)
// decides the lock was lost and marks the job "stalled" even though the worker is still actively
// parsing, not dead. Observed in production: every Report 20 job ever submitted failed with
// "job stalled more than allowable limit" after repeated "could not renew lock" errors, despite
// the worker process being alive and plenty of free system memory (ruling out an OOM restart).
// 600s matches the transaction timeout already used for the same class of large-file operations
// (see reconcileReport20, stageMemberImport) -- comfortably longer than any single parse should
// take, so a genuinely dead worker still gets detected, just not a merely-busy one.
const LOCK_DURATION_MS = 600_000;

// Separate process from the API server (started via `npm run worker`, or the "gnatsupreme-worker"
// PM2 app in production) — CPU-bound job processing runs here so it never shares an event loop with
// requests being served by the API process(es). Each Worker opens its own Redis connection (BullMQ
// requires this, and disallows sharing one Queue/Worker connection across instances).
const report20Worker = new Worker(REPORT20_QUEUE_NAME, (job) => processReport20Job(job.data), {
  connection: createRedisConnection(),
  concurrency: env.WORKER_CONCURRENCY,
  lockDuration: LOCK_DURATION_MS,
});

const memberImportWorker = new Worker(MEMBER_IMPORT_QUEUE_NAME, (job) => processMemberImportJob(job.data), {
  connection: createRedisConnection(),
  concurrency: env.WORKER_CONCURRENCY,
  lockDuration: LOCK_DURATION_MS,
});

for (const worker of [report20Worker, memberImportWorker]) {
  worker.on("failed", (job, error) =>
    logger.error({ err: error, queue: worker.name, jobId: job?.id }, "Job failed"),
  );
  worker.on("error", (error) => logger.error({ err: error, queue: worker.name }, "Worker error"));
}

logger.info({ concurrency: env.WORKER_CONCURRENCY }, "Worker process started");

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Worker shutting down gracefully");
  await Promise.all([report20Worker.close(), memberImportWorker.close()]);
  await prisma.$disconnect();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
