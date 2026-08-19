import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).nullable();

export const updateOrganizationSettingsSchema = z
  .object({
    expectedVersion: z.coerce.number().int().positive(),
    portalName: z.string().trim().min(2).max(100).optional(),
    schemeSponsor: z.string().trim().min(2).max(100).optional(),
    underwriter: z.string().trim().min(2).max(100).optional(),
    sidebarMark: z.string().trim().toUpperCase().min(1).max(3).regex(/^[A-Z0-9]+$/).optional(),
    primaryColor: z.string().trim().toUpperCase().regex(/^#[0-9A-F]{6}$/).optional(),
    accentColor: z.string().trim().toUpperCase().regex(/^#[0-9A-F]{6}$/).optional(),
    memberIdLabel: z.string().trim().min(2).max(60).optional(),
    reconciliationSource: z.string().trim().min(2).max(100).optional(),
    subRegionLabel: z.string().trim().min(2).max(60).optional(),
    organizationEmail: z.string().trim().toLowerCase().email().nullable().optional(),
    organizationPhone: nullableText(30).optional(),
    address: nullableText(300).optional(),
    websiteUrl: z.string().trim().url().nullable().optional(),
    privacyNotice: nullableText(2_000).optional(),
    timezone: z.string().trim().min(3).max(64).refine((value) => {
      try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
    }, "Enter a valid IANA timezone").optional(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), "Provide at least one setting to update");

export const settingsHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
