import { Router, type Response } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma.js";
import { authenticateMember, type AuthenticatedMember } from "../../middleware/authenticate-member.js";

export const memberNotificationRouter = Router();
const idSchema = z.object({ id: z.coerce.number().int().positive() });

function member(response: Response) {
  return response.locals.member as AuthenticatedMember;
}

memberNotificationRouter.use(authenticateMember);

memberNotificationRouter.get("/notifications", async (_request, response) => {
  const items = await prisma.notification.findMany({
    where: { memberId: member(response).id, channel: "IN_APP" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, type: true, title: true, message: true, readAt: true, createdAt: true },
  });
  const unreadCount = items.filter((item) => !item.readAt).length;
  response.json({ success: true, data: items, unreadCount });
});

memberNotificationRouter.patch("/notifications/read-all", async (_request, response) => {
  const result = await prisma.notification.updateMany({ where: { memberId: member(response).id, channel: "IN_APP", readAt: null }, data: { readAt: new Date() } });
  response.json({ success: true, data: { updated: result.count } });
});

memberNotificationRouter.patch("/notifications/:id/read", async (request, response) => {
  const params = idSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ success: false, message: "Invalid notification ID" });
    return;
  }
  const result = await prisma.notification.updateMany({ where: { id: params.data.id, memberId: member(response).id, channel: "IN_APP" }, data: { readAt: new Date() } });
  if (!result.count) {
    response.status(404).json({ success: false, message: "Notification not found" });
    return;
  }
  response.json({ success: true, data: { id: params.data.id, read: true } });
});
