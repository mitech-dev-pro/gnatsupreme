import type { Request } from "express";

import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthenticatedUser } from "../../middleware/authenticate.js";

type AuditInput = {
  request: Request;
  actor?: Pick<AuthenticatedUser, "id" | "email" | "regionId" | "districtId"> | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: number | string | null;
  description: string;
  beforeData?: unknown;
  afterData?: unknown;
  regionId?: number | null;
  districtId?: number | null;
};

function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function recordAudit(input: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? input.actorEmail ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId == null ? null : String(input.entityId),
        description: input.description,
        beforeData: asJson(input.beforeData),
        afterData: asJson(input.afterData),
        regionId: input.regionId ?? input.actor?.regionId ?? null,
        districtId: input.districtId ?? input.actor?.districtId ?? null,
        ipAddress: input.request.ip?.slice(0, 64),
        userAgent: input.request.get("user-agent")?.slice(0, 500),
      },
    });
  } catch (error) {
    console.error("Audit log write failed:", error);
  }
}
