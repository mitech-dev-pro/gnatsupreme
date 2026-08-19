import { Router, type Request, type Response } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { authorizeRoles } from "../../middleware/authorize.js";
import { recordAudit } from "../audit/audit.service.js";
import { settingsHistoryQuerySchema, updateOrganizationSettingsSchema } from "./settings.schemas.js";
import { getOrganizationSettings, organizationDefaults, publicBranding, settingsSnapshot } from "./settings.service.js";

export const settingsRouter = Router();
export const publicSettingsRouter = Router();

class SettingsConflict extends Error {}

function user(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

async function applySettingsUpdate(request: Request, response: Response, values: Record<string, unknown>, expectedVersion: number) {
  const actor = user(response);
  const existing = await getOrganizationSettings();
  if (existing.version !== expectedVersion) throw new SettingsConflict(`Settings were updated by another user. Current version is ${existing.version}.`);
  const changedFields = Object.keys(values).filter((key) => JSON.stringify(existing[key as keyof typeof existing]) !== JSON.stringify(values[key]));
  if (!changedFields.length) return existing;
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.organizationSettings.updateMany({ where: { id: existing.id, version: expectedVersion }, data: { ...values, version: { increment: 1 }, updatedById: actor.id } });
    if (result.count !== 1) throw new SettingsConflict("Settings changed while this request was being processed");
    const next = await transaction.organizationSettings.findUniqueOrThrow({ where: { id: existing.id }, include: { updatedBy: { select: { id: true, fullName: true, email: true } } } });
    await transaction.organizationSettingsVersion.create({ data: { settingsId: next.id, version: next.version, snapshot: settingsSnapshot(next), changedFields, changedById: actor.id } });
    return next;
  });
  await recordAudit({ request, actor, action: "ORGANIZATION_SETTINGS_UPDATED", entityType: "ORGANIZATION_SETTINGS", entityId: updated.id, description: `Updated organization settings to version ${updated.version}`, beforeData: Object.fromEntries(changedFields.map((field) => [field, existing[field as keyof typeof existing]])), afterData: Object.fromEntries(changedFields.map((field) => [field, updated[field as keyof typeof updated]])) });
  return updated;
}

publicSettingsRouter.get("/branding", async (_request, response) => {
  response.json({ success: true, data: publicBranding(await getOrganizationSettings()) });
});

settingsRouter.use(authenticate);

settingsRouter.get("/organization", async (_request, response) => {
  response.json({ success: true, data: await getOrganizationSettings() });
});

settingsRouter.patch("/organization", authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN"), async (request, response) => {
  const parsed = updateOrganizationSettingsSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ success: false, message: "Invalid settings", errors: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
    return;
  }
  const { expectedVersion, ...values } = parsed.data;
  try {
    response.json({ success: true, data: await applySettingsUpdate(request, response, values, expectedVersion) });
  } catch (error) {
    if (error instanceof SettingsConflict) {
      response.status(409).json({ success: false, message: error.message, data: await getOrganizationSettings() });
      return;
    }
    throw error;
  }
});

settingsRouter.post("/organization/reset", authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN"), async (request, response) => {
  const expectedVersion = Number(request.body?.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    response.status(400).json({ success: false, message: "A valid expectedVersion is required" });
    return;
  }
  try {
    response.json({ success: true, data: await applySettingsUpdate(request, response, organizationDefaults, expectedVersion) });
  } catch (error) {
    if (error instanceof SettingsConflict) {
      response.status(409).json({ success: false, message: error.message, data: await getOrganizationSettings() });
      return;
    }
    throw error;
  }
});

settingsRouter.get("/organization/history", authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN"), async (request, response) => {
  const query = settingsHistoryQuerySchema.safeParse(request.query);
  if (!query.success) {
    response.status(400).json({ success: false, message: "Invalid query" });
    return;
  }
  const settings = await getOrganizationSettings();
  const { page, limit } = query.data;
  const [versions, total] = await prisma.$transaction([
    prisma.organizationSettingsVersion.findMany({ where: { settingsId: settings.id }, include: { changedBy: { select: { id: true, fullName: true, email: true } } }, orderBy: { version: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.organizationSettingsVersion.count({ where: { settingsId: settings.id } }),
  ]);
  response.json({ success: true, data: versions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});
