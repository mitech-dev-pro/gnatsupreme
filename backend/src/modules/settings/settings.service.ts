import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { deleteCacheKey, withCache } from "../../lib/cache.js";
import { env } from "../../config/env.js";

const settingsCacheKey = "reference:settings:organization";

export const organizationDefaults = {
  portalName: "GNAT Supreme Care",
  schemeSponsor: "GNAT",
  underwriter: "miLife Insurance",
  sidebarMark: "GS",
  primaryColor: "#102A43",
  accentColor: "#00A896",
  memberIdLabel: "Controller ID",
  reconciliationSource: "CAGD Report 20",
  subRegionLabel: "District",
  organizationEmail: null,
  organizationPhone: null,
  address: null,
  websiteUrl: null,
  privacyNotice: null,
  timezone: "Africa/Accra",
  currency: "GHS",
} as const;

export async function getOrganizationSettings() {
  return withCache(settingsCacheKey, env.READ_CACHE_TTL_SECONDS, () =>
    prisma.organizationSettings.upsert({
      where: { singletonKey: "MILIFE" },
      update: {},
      create: { singletonKey: "MILIFE", ...organizationDefaults },
      include: { updatedBy: { select: { id: true, fullName: true, email: true } } },
    }),
  );
}

export const invalidateOrganizationSettings = () => deleteCacheKey(settingsCacheKey);

export function settingsSnapshot(settings: Record<string, unknown>): Prisma.InputJsonValue {
  const { updatedBy, versions, ...snapshot } = settings;
  return JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue;
}

export function publicBranding(settings: Awaited<ReturnType<typeof getOrganizationSettings>>) {
  return {
    portalName: settings.portalName,
    schemeSponsor: settings.schemeSponsor,
    underwriter: settings.underwriter,
    sidebarMark: settings.sidebarMark,
    primaryColor: settings.primaryColor,
    accentColor: settings.accentColor,
    memberIdLabel: settings.memberIdLabel,
    reconciliationSource: settings.reconciliationSource,
    subRegionLabel: settings.subRegionLabel,
    organizationEmail: settings.organizationEmail,
    organizationPhone: settings.organizationPhone,
    address: settings.address,
    websiteUrl: settings.websiteUrl,
    privacyNotice: settings.privacyNotice,
    timezone: settings.timezone,
    currency: settings.currency,
    version: settings.version,
    updatedAt: settings.updatedAt,
  };
}
