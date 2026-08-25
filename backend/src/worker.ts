import { Worker } from "bullmq";

import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { createRedisConnection } from "./lib/redis.js";
import { processMemberImportJob } from "./modules/imports/member-import.worker.js";
import { processReport20Job } from "./modules/imports/report20.worker.js";
import { MEMBER_IMPORT_QUEUE_NAME, REPORT20_QUEUE_NAME } from "./queues/import.queue.js";

// Separate process from the API server (started via `npm run worker`, or the "gnatsupreme-worker"
// PM2 app in production) — CPU-bound job processing runs here so it never shares an event loop with
// requests being served by the API process(es). Each Worker opens its own Redis connection (BullMQ
// requires this, and disallows sharing one Queue/Worker connection across instances).
const report20Worker = new Worker(REPORT20_QUEUE_NAME, (job) => processReport20Job(job.data), {
  connection: createRedisConnection(),
  concurrency: env.WORKER_CONCURRENCY,
});

const memberImportWorker = new Worker(MEMBER_IMPORT_QUEUE_NAME, (job) => processMemberImportJob(job.data), {
  connection: createRedisConnection(),
  concurrency: env.WORKER_CONCURRENCY,
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
