import { Router, type Response } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { authorizeRoles } from "../../middleware/authorize.js";
import { processNotificationById } from "./notification.service.js";

export const notificationRouter = Router();
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  unreadOnly: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
});

function user(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

notificationRouter.use(authenticate);

notificationRouter.get("/", async (request, response) => {
  const query = querySchema.safeParse(request.query);
  if (!query.success) {
    response.status(400).json({ success: false, message: "Invalid query" });
    return;
  }
  const { page, limit, unreadOnly } = query.data;
  const where = { userId: user(response).id, channel: "IN_APP" as const, ...(unreadOnly ? { readAt: null } : {}) };
  const [items, total] = await prisma.$transaction([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.notification.count({ where }),
  ]);
  response.json({ success: true, data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

notificationRouter.get("/unread-count", async (_request, response) => {
  const count = await prisma.notification.count({ where: { userId: user(response).id, channel: "IN_APP", readAt: null } });
  response.json({ success: true, data: { count } });
});

notificationRouter.patch("/read-all", async (_request, response) => {
  const result = await prisma.notification.updateMany({ where: { userId: user(response).id, channel: "IN_APP", readAt: null }, data: { readAt: new Date() } });
  response.json({ success: true, data: { updated: result.count } });
});

notificationRouter.patch("/:id/read", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid notification ID" });
    return;
  }
  const result = await prisma.notification.updateMany({ where: { id: params.data.id, userId: user(response).id, channel: "IN_APP" }, data: { readAt: new Date() } });
  if (!result.count) {
    response.status(404).json({ success: false, message: "Notification not found" });
    return;
  }
  response.json({ success: true, data: { id: params.data.id, read: true } });
});

notificationRouter.post("/:id/retry", authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN"), async (request, response) => {
  const params = idSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid notification ID" });
    return;
  }
  const notification = await prisma.notification.findFirst({ where: { id: params.data.id, channel: "SMS", status: "FAILED" } });
  if (!notification) {
    response.status(404).json({ success: false, message: "Failed SMS notification not found" });
    return;
  }
  await prisma.notification.update({ where: { id: notification.id }, data: { status: "QUEUED", attempts: 0, nextAttemptAt: new Date(), lastError: null } });
  const delivered = await processNotificationById(notification.id);
  response.json({ success: true, data: delivered });
});
