import { processNotificationBatch, recoverStaleNotifications } from "./notification.service.js";

export async function startNotificationWorker() {
  await recoverStaleNotifications();
  const run = () => processNotificationBatch().catch((error) => console.error("Notification worker failed:", error));
  void run();
  const timer = setInterval(run, 5_000);
  timer.unref();
  return () => clearInterval(timer);
}
