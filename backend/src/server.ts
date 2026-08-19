import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";
import { startNotificationWorker } from "./modules/notifications/notification.worker.js";

const stopNotificationWorker = await startNotificationWorker();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Server started");
});

let shuttingDown = false;
const shutdown = (signal: string, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down gracefully");

  stopNotificationWorker();
  const forceExit = setTimeout(() => {
    logger.fatal("Graceful shutdown timed out");
    process.exit(1);
  }, 15_000);
  forceExit.unref();
  server.close(async (error) => {
    clearTimeout(forceExit);
    await prisma.$disconnect();

    if (error) {
      logger.error({ err: error }, "Server shutdown failed");
      process.exit(1);
    }

    process.exit(exitCode);
  });
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  shutdown("uncaughtException", 1);
});
process.once("unhandledRejection", (error) => {
  logger.fatal({ err: error }, "Unhandled promise rejection");
  shutdown("unhandledRejection", 1);
});
