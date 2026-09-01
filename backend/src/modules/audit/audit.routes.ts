import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma.js";
import { cachedCount } from "../../lib/cached-count.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";

export const auditRouter = Router();

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  actorId: z.coerce.number().int().positive().optional(),
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().trim().max(80).optional(),
  search: z.string().trim().max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

auditRouter.use(authenticate);

auditRouter.get("/", async (request, response) => {
  const parsed = querySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({
      success: false,
      message: "Invalid request",
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const user = response.locals.user as AuthenticatedUser;
  const { page, limit, actorId, action, entityType, entityId, search, from, to } = parsed.data;
  const scope =
    user.role === "REGIONAL_ADMIN"
      ? { regionId: user.regionId ?? -1 }
      : user.role === "DISTRICT_ADMIN"
        ? { districtId: user.districtId ?? -1 }
        : {};
  const where = {
    ...scope,
    ...(actorId ? { actorId } : {}),
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(search
      ? { description: { contains: search, mode: "insensitive" as const } }
      : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, fullName: true, email: true, role: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    cachedCount("audit-logs", where, () => prisma.auditLog.count({ where })),
  ]);

  response.json({
    success: true,
    data: logs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});
