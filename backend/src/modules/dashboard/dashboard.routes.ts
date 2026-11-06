import { Router, type Response } from "express";

import { env } from "../../config/env.js";
import { withCache } from "../../lib/cache.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { memberScope } from "../members/member.access.js";
import { geoScopeWhere } from "../../lib/geo-scope.js";

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

// See the equivalent function in transfer.routes.ts -- transfers are two-sided, so they don't
// fit the single-field shape in lib/geo-scope.ts. Always the `{ in: ... }` fragment, even for an
// empty scope array, so an unrecognized or empty-scope admin matches nothing.
function transferScope(user: AuthenticatedUser) {
  if (user.role === "REGIONAL_ADMIN")
    return {
      OR: [
        { fromDistrict: { regionId: { in: user.regionIds } } },
        { toDistrict: { regionId: { in: user.regionIds } } },
      ],
    };
  if (user.role === "DISTRICT_ADMIN")
    return {
      OR: [
        { fromDistrictId: { in: user.districtIds } },
        { toDistrictId: { in: user.districtIds } },
      ],
    };
  if (user.role === "SUPER_ADMIN" || user.role === "NATIONAL_ADMIN") return {};
  return { OR: [{ fromDistrictId: { in: [] } }, { toDistrictId: { in: [] } }] };
}

function auditScope(user: AuthenticatedUser) {
  return geoScopeWhere(user);
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
  // Always include the `= ANY($1::int[])` clause -- never guard it behind
  // `if (ids.length)`, which would omit the filter entirely for an empty-scope admin and
  // silently fall back to an unfiltered (all-members) query. An empty array naturally matches
  // zero rows under `= ANY`.
  if (user.role === "DISTRICT_ADMIN") {
    const districtIds = user.districtIds;
    const [summary] = await prisma.$queryRawUnsafe<MemberAggregate[]>(
      `SELECT ${memberAggregateColumns} FROM members m WHERE m.district_id = ANY($1::int[])`,
      districtIds,
    );
    const enrollments = await prisma.$queryRaw<EnrollmentAggregate[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS count
      FROM members WHERE district_id = ANY(${districtIds}::int[]) AND created_at >= ${firstMonth}
      GROUP BY DATE_TRUNC('month', created_at) ORDER BY DATE_TRUNC('month', created_at)`;
    return { summary: summary!, enrollments };
  }

  if (user.role === "REGIONAL_ADMIN") {
    const regionIds = user.regionIds;
    const [summary] = await prisma.$queryRawUnsafe<MemberAggregate[]>(
      `SELECT ${memberAggregateColumns} FROM members m JOIN districts d ON d.id = m.district_id WHERE d.region_id = ANY($1::int[])`,
      regionIds,
    );
    const enrollments = await prisma.$queryRaw<EnrollmentAggregate[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', m.created_at), 'YYYY-MM') AS month, COUNT(*) AS count
      FROM members m JOIN districts d ON d.id = m.district_id
      WHERE d.region_id = ANY(${regionIds}::int[]) AND m.created_at >= ${firstMonth}
      GROUP BY DATE_TRUNC('month', m.created_at) ORDER BY DATE_TRUNC('month', m.created_at)`;
    return { summary: summary!, enrollments };
  }

  const [summary] = await prisma.$queryRawUnsafe<MemberAggregate[]>(
    `SELECT ${memberAggregateColumns} FROM members m`,
  );
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

  const [
    { summary, enrollments },
    totalSpouses,
    totalBeneficiaries,
    pendingTransfers,
    recentActivity,
    latestImport,
    claimStatusGroups,
    claimsAwaitingReview,
    claimsWithUnknownDelivery,
  ] = await Promise.all([
    aggregateMembers(user, firstMonth),
    prisma.spouse.count({ where: { member: { is: scope } } }),
    prisma.beneficiary.count({ where: { member: { is: scope } } }),
    prisma.memberTransfer.count({ where: { ...transferScope(user), status: "PENDING" } }),
    prisma.auditLog.findMany({
      where: auditScope(user),
      include: { actor: { select: { id: true, fullName: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
    }),
    elevated
      ? prisma.importJob.findFirst({
          where: { type: "REPORT_20" },
          select: {
            id: true,
            status: true,
            reportMonth: true,
            totalRows: true,
            matchedRows: true,
            changedRows: true,
            unmatchedRows: true,
            duplicateRows: true,
            invalidRows: true,
            completedAt: true,
            file: { select: { originalName: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve(null),
    prisma.externalClaimSubmission.groupBy({
      by: ["status"],
      where: { member: { is: scope } },
      _count: { _all: true },
    }),
    // Mirrors the exact criteria /claims/approvals?awaitingReview=true filters on, so the
    // dashboard count and the queue it links to never disagree.
    prisma.externalClaimSubmission.count({
      where: {
        member: { is: scope },
        status: "PENDING",
        source: "MEMBER_PORTAL",
        reviewedAt: null,
        deliveryState: "NOT_SENT",
      },
    }),
    prisma.externalClaimSubmission.count({
      where: { member: { is: scope }, deliveryState: "UNKNOWN" },
    }),
  ]);

  const totalMembers = number(summary.total);
  const report20Matched = number(summary.report20Matched);
  const latestImportMatchRate =
    latestImport && latestImport.totalRows
      ? latestImport.matchedRows === latestImport.totalRows
        ? 100
        : Math.floor((latestImport.matchedRows / latestImport.totalRows) * 1000) / 10
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
    report20: {
      matchedMembers: report20Matched,
      unmatchedMembers: Math.max(totalMembers - report20Matched, 0),
      matchRate: latestImportMatchRate,
      latestImport,
    },
    transfers: { pending: pendingTransfers },
    claims: {
      byStatus: Object.fromEntries(
        claimStatusGroups.map((group) => [group.status, group._count._all]),
      ),
      awaitingReview: claimsAwaitingReview,
      unknownDelivery: claimsWithUnknownDelivery,
    },
    enrollmentGrowth,
    recentActivity,
  };
}

dashboardRouter.use(authenticate);

dashboardRouter.get("/", async (_request, response) => {
  const user = currentUser(response);
  // Numerically sorted, not the default lexicographic join -- a stable key per scope regardless
  // of array insertion order.
  const sortedRegionIds = [...user.regionIds].sort((a, b) => a - b).join(",");
  const sortedDistrictIds = [...user.districtIds].sort((a, b) => a - b).join(",");
  const key = `dashboard:v3:${user.role}:${sortedRegionIds}:${sortedDistrictIds}`;
  response.json({
    success: true,
    data: await withCache(key, env.READ_CACHE_TTL_SECONDS, () => loadDashboard(user)),
  });
});
