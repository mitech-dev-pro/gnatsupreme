import { processNotificationBatch, recoverStaleNotifications } from "./notification.service.js";
import { logger } from "../../lib/logger.js";

export async function startNotificationWorker() {
  await recoverStaleNotifications();
  const run = () => processNotificationBatch().catch((error) => logger.error({ err: error }, "Notification worker failed"));
  void run();
  const timer = setInterval(run, 5_000);
  timer.unref();
  return () => clearInterval(timer);
}
