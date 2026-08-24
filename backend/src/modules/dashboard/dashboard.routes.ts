import { Router, type Response } from "express";

import { prisma } from "../../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedUser,
} from "../../middleware/authenticate.js";
import { memberScope } from "../members/member.access.js";

export const dashboardRouter = Router();

function currentUser(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

function transferScope(user: AuthenticatedUser) {
  if (user.role === "REGIONAL_ADMIN") {
    return {
      OR: [
        { fromDistrict: { regionId: user.regionId ?? -1 } },
        { toDistrict: { regionId: user.regionId ?? -1 } },
      ],
    };
  }
  if (user.role === "DISTRICT_ADMIN") {
    return {
      OR: [
        { fromDistrictId: user.districtId ?? -1 },
        { toDistrictId: user.districtId ?? -1 },
      ],
    };
  }
  return {};
}

function auditScope(user: AuthenticatedUser) {
  if (user.role === "REGIONAL_ADMIN") return { regionId: user.regionId ?? -1 };
  if (user.role === "DISTRICT_ADMIN")
    return { districtId: user.districtId ?? -1 };
  return {};
}

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

dashboardRouter.use(authenticate);

dashboardRouter.get("/", async (_request, response) => {
  const user = currentUser(response);
  const scope = memberScope(user);
  const elevated =
    user.role === "SUPER_ADMIN" || user.role === "NATIONAL_ADMIN";
  const firstMonth = monthStart(new Date());
  firstMonth.setUTCMonth(firstMonth.getUTCMonth() - 11);

  const [
    statusGroups,
    report20Matched,
    missingFromReport20,
    totalSpouses,
    totalBeneficiaries,
    pendingTransfers,
    recentActivity,
    enrollments,
    latestImport,
    claimStatusGroups,
  ] = await Promise.all([
    prisma.member.groupBy({
      by: ["status"],
      where: scope,
      _count: { _all: true },
    }),
    prisma.member.count({ where: { ...scope, report20Matched: true } }),
    prisma.member.count({ where: { ...scope, missingFromReport20At: { not: null } } }),
    prisma.spouse.count({ where: { member: { is: scope } } }),
    prisma.beneficiary.count({ where: { member: { is: scope } } }),
    prisma.memberTransfer.count({
      where: { ...transferScope(user), status: "PENDING" },
    }),
    prisma.auditLog.findMany({
      where: auditScope(user),
      include: { actor: { select: { id: true, fullName: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
    }),
    prisma.member.findMany({
      where: { ...scope, createdAt: { gte: firstMonth } },
      select: { createdAt: true },
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
  ]);

  const statusCounts = Object.fromEntries(
    statusGroups.map((group) => [group.status, group._count._all]),
  );
  const totalMembers = statusGroups.reduce(
    (total, group) => total + group._count._all,
    0,
  );
  const latestImportMatchRate =
    latestImport && latestImport.totalRows
      ? latestImport.matchedRows === latestImport.totalRows
        ? 100
        : Math.floor(
            (latestImport.matchedRows / latestImport.totalRows) * 1000,
          ) / 10
      : 0;
  const enrollmentCounts = new Map<string, number>();
  for (const member of enrollments) {
    const key = monthStart(member.createdAt).toISOString().slice(0, 7);
    enrollmentCounts.set(key, (enrollmentCounts.get(key) ?? 0) + 1);
  }
  const enrollmentGrowth = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(firstMonth);
    date.setUTCMonth(firstMonth.getUTCMonth() + index);
    const month = date.toISOString().slice(0, 7);
    return { month, count: enrollmentCounts.get(month) ?? 0 };
  });

  response.json({
    success: true,
    data: {
      members: {
        total: totalMembers,
        active: statusCounts.ACTIVE ?? 0,
        pending: statusCounts.PENDING ?? 0,
        flagged: statusCounts.FLAGGED ?? 0,
        returned: statusCounts.RETURNED ?? 0,
        removed: statusCounts.REMOVED ?? 0,
        missingFromReport20,
      },
      coverage: { spouses: totalSpouses, beneficiaries: totalBeneficiaries },
      report20: {
        matchedMembers: report20Matched,
        unmatchedMembers: Math.max(totalMembers - report20Matched, 0),
        // Report 20's own POV: the latest file's row-level reconciliation result. This is what
        // "Operational health" on the dashboard shows, since it answers "how well does the
        // current roster reconcile against the most recent file" directly, with no staleness risk.
        matchRate: latestImportMatchRate,
        latestImport,
      },
      transfers: { pending: pendingTransfers },
      claims: Object.fromEntries(
        claimStatusGroups.map((group) => [group.status, group._count._all]),
      ),
      enrollmentGrowth,
      recentActivity,
    },
  });
});
