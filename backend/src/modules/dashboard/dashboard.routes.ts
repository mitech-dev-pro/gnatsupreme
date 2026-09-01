import { Router, type Response } from "express";

import { env } from "../../config/env.js";
import { withCache } from "../../lib/cache.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { memberScope } from "../members/member.access.js";

export const dashboardRouter = Router();

type MemberAggregate = {
  total: bigint;
  active: bigint;
  pending: bigint;
  flagged: bigint;
  returned: bigint;
  removed: bigint;
  inactive: bigint;
  report20Matched: bigint;
  missingFromReport20: bigint;
};

type EnrollmentAggregate = { month: string; count: bigint };

function currentUser(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

function transferScope(user: AuthenticatedUser) {
  if (user.role === "REGIONAL_ADMIN") return { OR: [{ fromDistrict: { regionId: user.regionId ?? -1 } }, { toDistrict: { regionId: user.regionId ?? -1 } }] };
  if (user.role === "DISTRICT_ADMIN") return { OR: [{ fromDistrictId: user.districtId ?? -1 }, { toDistrictId: user.districtId ?? -1 }] };
  return {};
}

function auditScope(user: AuthenticatedUser) {
  if (user.role === "REGIONAL_ADMIN") return { regionId: user.regionId ?? -1 };
  if (user.role === "DISTRICT_ADMIN") return { districtId: user.districtId ?? -1 };
  return {};
}

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

const memberAggregateColumns = `
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE m.status = 'ACTIVE') AS active,
  COUNT(*) FILTER (WHERE m.status = 'PENDING') AS pending,
  COUNT(*) FILTER (WHERE m.status = 'FLAGGED') AS flagged,
  COUNT(*) FILTER (WHERE m.status = 'RETURNED') AS returned,
  COUNT(*) FILTER (WHERE m.status = 'REMOVED') AS removed,
  COUNT(*) FILTER (WHERE m.status = 'INACTIVE') AS inactive,
  COUNT(*) FILTER (WHERE m.report20_matched = TRUE) AS "report20Matched",
  COUNT(*) FILTER (WHERE m.missing_from_report20_at IS NOT NULL) AS "missingFromReport20"`;

async function aggregateMembers(user: AuthenticatedUser, firstMonth: Date) {
  if (user.role === "DISTRICT_ADMIN") {
    const districtId = user.districtId ?? -1;
    const [summary] = await prisma.$queryRawUnsafe<MemberAggregate[]>(`SELECT ${memberAggregateColumns} FROM members m WHERE m.district_id = $1`, districtId);
    const enrollments = await prisma.$queryRaw<EnrollmentAggregate[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS count
      FROM members WHERE district_id = ${districtId} AND created_at >= ${firstMonth}
      GROUP BY DATE_TRUNC('month', created_at) ORDER BY DATE_TRUNC('month', created_at)`;
    return { summary: summary!, enrollments };
  }

  if (user.role === "REGIONAL_ADMIN") {
    const regionId = user.regionId ?? -1;
    const [summary] = await prisma.$queryRawUnsafe<MemberAggregate[]>(`SELECT ${memberAggregateColumns} FROM members m JOIN districts d ON d.id = m.district_id WHERE d.region_id = $1`, regionId);
    const enrollments = await prisma.$queryRaw<EnrollmentAggregate[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', m.created_at), 'YYYY-MM') AS month, COUNT(*) AS count
      FROM members m JOIN districts d ON d.id = m.district_id
      WHERE d.region_id = ${regionId} AND m.created_at >= ${firstMonth}
      GROUP BY DATE_TRUNC('month', m.created_at) ORDER BY DATE_TRUNC('month', m.created_at)`;
    return { summary: summary!, enrollments };
  }

  const [summary] = await prisma.$queryRawUnsafe<MemberAggregate[]>(`SELECT ${memberAggregateColumns} FROM members m`);
  const enrollments = await prisma.$queryRaw<EnrollmentAggregate[]>`
    SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS count
    FROM members WHERE created_at >= ${firstMonth}
    GROUP BY DATE_TRUNC('month', created_at) ORDER BY DATE_TRUNC('month', created_at)`;
  return { summary: summary!, enrollments };
}

function number(value: bigint | undefined) {
  return Number(value ?? 0n);
}

async function loadDashboard(user: AuthenticatedUser) {
  const scope = memberScope(user);
  const elevated = user.role === "SUPER_ADMIN" || user.role === "NATIONAL_ADMIN";
  const firstMonth = monthStart(new Date());
  firstMonth.setUTCMonth(firstMonth.getUTCMonth() - 11);

  const [{ summary, enrollments }, totalSpouses, totalBeneficiaries, pendingTransfers, recentActivity, latestImport, claimStatusGroups] = await Promise.all([
    aggregateMembers(user, firstMonth),
    prisma.spouse.count({ where: { member: { is: scope } } }),
    prisma.beneficiary.count({ where: { member: { is: scope } } }),
    prisma.memberTransfer.count({ where: { ...transferScope(user), status: "PENDING" } }),
    prisma.auditLog.findMany({ where: auditScope(user), include: { actor: { select: { id: true, fullName: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10 }),
    elevated ? prisma.importJob.findFirst({
      where: { type: "REPORT_20" },
      select: { id: true, status: true, reportMonth: true, totalRows: true, matchedRows: true, changedRows: true, unmatchedRows: true, duplicateRows: true, invalidRows: true, completedAt: true, file: { select: { originalName: true } } },
      orderBy: { createdAt: "desc" },
    }) : Promise.resolve(null),
    prisma.externalClaimSubmission.groupBy({ by: ["status"], where: { member: { is: scope } }, _count: { _all: true } }),
  ]);

  const totalMembers = number(summary.total);
  const report20Matched = number(summary.report20Matched);
  const latestImportMatchRate = latestImport && latestImport.totalRows
    ? latestImport.matchedRows === latestImport.totalRows ? 100 : Math.floor((latestImport.matchedRows / latestImport.totalRows) * 1000) / 10
    : 0;
  const enrollmentCounts = new Map(enrollments.map((row) => [row.month, number(row.count)]));
  const enrollmentGrowth = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(firstMonth);
    date.setUTCMonth(firstMonth.getUTCMonth() + index);
    const month = date.toISOString().slice(0, 7);
    return { month, count: enrollmentCounts.get(month) ?? 0 };
  });

  return {
    members: {
      total: totalMembers,
      active: number(summary.active),
      pending: number(summary.pending),
      flagged: number(summary.flagged),
      returned: number(summary.returned),
      removed: number(summary.removed),
      inactive: number(summary.inactive),
      missingFromReport20: number(summary.missingFromReport20),
    },
    coverage: { spouses: totalSpouses, beneficiaries: totalBeneficiaries },
    report20: { matchedMembers: report20Matched, unmatchedMembers: Math.max(totalMembers - report20Matched, 0), matchRate: latestImportMatchRate, latestImport },
    transfers: { pending: pendingTransfers },
    claims: Object.fromEntries(claimStatusGroups.map((group) => [group.status, group._count._all])),
    enrollmentGrowth,
    recentActivity,
  };
}

dashboardRouter.use(authenticate);

dashboardRouter.get("/", async (_request, response) => {
  const user = currentUser(response);
  const key = `dashboard:v2:${user.role}:${user.regionId ?? 0}:${user.districtId ?? 0}`;
  response.json({ success: true, data: await withCache(key, env.READ_CACHE_TTL_SECONDS, () => loadDashboard(user)) });
});
