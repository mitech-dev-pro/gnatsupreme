import { env } from "../../config/env.js";
import { deleteCachePrefix, withCache } from "../../lib/cache.js";
import { prisma } from "../../lib/prisma.js";

export const benefitPlanInclude = {
  benefits: { orderBy: { type: "asc" as const } },
  createdBy: { select: { id: true, fullName: true, email: true } },
} as const;

const currentKey = "reference:benefits:current";
const scheduleKey = "reference:benefits:schedule";

export function getCurrentBenefitPlan() {
  return withCache(currentKey, env.READ_CACHE_TTL_SECONDS, () =>
    prisma.benefitPlanVersion.findFirst({
      where: { effectiveFrom: { lte: new Date() } },
      include: benefitPlanInclude,
      orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
    }),
  );
}

export function getBenefitSchedule() {
  return withCache(scheduleKey, env.READ_CACHE_TTL_SECONDS, async () => {
    const now = new Date();
    const [current, next] = await Promise.all([
      prisma.benefitPlanVersion.findFirst({ where: { effectiveFrom: { lte: now } }, include: benefitPlanInclude, orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }] }),
      prisma.benefitPlanVersion.findFirst({ where: { effectiveFrom: { gt: now } }, include: benefitPlanInclude, orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }] }),
    ]);
    return { current, next };
  });
}

export const invalidateBenefitPlans = () => deleteCachePrefix("reference:benefits:");
