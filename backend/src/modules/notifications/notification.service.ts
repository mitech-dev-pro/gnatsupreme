import { prisma } from "../../lib/prisma.js";
import { smsProvider } from "./sms.provider.js";

type QueueSmsInput = {
  type: string;
  title: string;
  message: string;
  destination: string;
  idempotencyKey: string;
  memberId?: number;
  userId?: number;
};

type NotifyMemberInput = {
  memberId: number;
  type: string;
  title: string;
  message: string;
  idempotencyKey: string;
  sendSms?: boolean;
};

export async function queueSmsNotification(input: QueueSmsInput) {
  return prisma.notification.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      channel: "SMS",
      status: "QUEUED",
      type: input.type,
      title: input.title,
      message: input.message,
      destination: input.destination,
      idempotencyKey: input.idempotencyKey,
      memberId: input.memberId,
      userId: input.userId,
    },
  });
}

export async function notifyMember(input: NotifyMemberInput) {
  const member = await prisma.member.findUnique({
    where: { id: input.memberId },
    select: { phone: true, phoneVerifiedAt: true },
  });
  const inApp = await prisma.notification.upsert({
    where: { idempotencyKey: `${input.idempotencyKey}:in-app` },
    update: {},
    create: {
      channel: "IN_APP",
      status: "SENT",
      type: input.type,
      title: input.title,
      message: input.message,
      idempotencyKey: `${input.idempotencyKey}:in-app`,
      memberId: input.memberId,
      sentAt: new Date(),
    },
  });
  let sms = null;
  if (input.sendSms !== false && member?.phone && member.phoneVerifiedAt) {
    sms = await queueSmsNotification({
      type: input.type,
      title: input.title,
      message: input.message,
      destination: member.phone,
      idempotencyKey: `${input.idempotencyKey}:sms`,
      memberId: input.memberId,
    });
  }
  return { inApp, sms };
}

export async function notifyStaffForMember(input: {
  memberId: number;
  type: string;
  title: string;
  message: string;
  idempotencyKey: string;
}) {
  const member = await prisma.member.findUnique({
    where: { id: input.memberId },
    select: { districtId: true, district: { select: { regionId: true } } },
  });
  if (!member) return [];
  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: { in: ["SUPER_ADMIN", "NATIONAL_ADMIN"] } },
        { role: "REGIONAL_ADMIN", regionId: member.district.regionId },
        { role: "DISTRICT_ADMIN", districtId: member.districtId },
      ],
    },
    select: { id: true },
  });
  return prisma.$transaction(
    recipients.map((recipient) =>
      prisma.notification.upsert({
        where: { idempotencyKey: `${input.idempotencyKey}:user:${recipient.id}` },
        update: {},
        create: {
          channel: "IN_APP",
          status: "SENT",
          type: input.type,
          title: input.title,
          message: input.message,
          idempotencyKey: `${input.idempotencyKey}:user:${recipient.id}`,
          userId: recipient.id,
          sentAt: new Date(),
        },
      }),
    ),
  );
}

export async function processNotificationById(id: number) {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.channel !== "SMS" || !notification.destination || notification.status === "SENT" || notification.status === "CANCELLED" || notification.attempts >= notification.maxAttempts) return notification;
  const claimed = await prisma.notification.updateMany({
    where: { id, status: { in: ["QUEUED", "FAILED"] }, attempts: { lt: notification.maxAttempts } },
    data: { status: "PROCESSING" },
  });
  if (claimed.count !== 1) return notification;
  try {
    const result = await smsProvider.send({ to: notification.destination, message: notification.message, type: notification.type });
    return prisma.notification.update({
      where: { id },
      data: { status: "SENT", attempts: { increment: 1 }, providerMessageId: result.providerMessageId, lastError: null, sentAt: new Date() },
    });
  } catch (error) {
    const attempts = notification.attempts + 1;
    const delayMinutes = Math.min(2 ** attempts, 60);
    return prisma.notification.update({
      where: { id },
      data: { status: "FAILED", attempts, lastError: error instanceof Error ? error.message.slice(0, 500) : "SMS delivery failed", nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000) },
    });
  }
}

export async function processNotificationBatch(limit = 20) {
  const due = await prisma.notification.findMany({
    where: { channel: "SMS", status: { in: ["QUEUED", "FAILED"] }, nextAttemptAt: { lte: new Date() }, attempts: { lt: 5 } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  await Promise.all(due.map((item) => processNotificationById(item.id)));
  return due.length;
}

export async function recoverStaleNotifications() {
  await prisma.notification.updateMany({
    where: { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
    data: { status: "FAILED", lastError: "Delivery worker was interrupted", nextAttemptAt: new Date() },
  });
}
