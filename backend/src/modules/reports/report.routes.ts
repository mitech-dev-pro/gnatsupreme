import { once } from "node:events";

import { Router, type Request, type Response } from "express";

import { prisma } from "../../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedUser,
} from "../../middleware/authenticate.js";
import { authorizeRoles } from "../../middleware/authorize.js";
import { recordAudit } from "../audit/audit.service.js";
import { memberScope } from "../members/member.access.js";

export const reportRouter = Router();

const BATCH_SIZE = 1_000;

function currentUser(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

function csvCell(value: unknown) {
  if (value == null) return "";
  let text =
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  if (/^[\t ]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(values: unknown[]) {
  return `${values.map(csvCell).join(",")}\r\n`;
}

async function write(response: Response, content: string) {
  if (!response.write(content)) await once(response, "drain");
}

async function sendReport(
  request: Request,
  response: Response,
  filename: string,
  columns: string[],
  produce: (emit: (values: unknown[]) => Promise<void>) => Promise<number>,
) {
  response.status(200);
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`,
  );
  response.setHeader("X-Content-Type-Options", "nosniff");
  await write(response, `\uFEFF${csvRow(columns)}`);
  const rowCount = await produce((values) => write(response, csvRow(values)));
  await recordAudit({
    request,
    actor: currentUser(response),
    action: "REPORT_EXPORTED",
    entityType: "REPORT",
    entityId: filename,
    description: `Exported ${filename}`,
    afterData: { filename, rowCount },
  });
  response.end();
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

reportRouter.use(authenticate);

reportRouter.get("/membership.csv", async (request, response) => {
  const user = currentUser(response);
  await sendReport(
    request,
    response,
    "membership-roster.csv",
    [
      "Controller ID",
      "Full Name",
      "Ghana Card ID",
      "School",
      "District",
      "Region",
      "Status",
      "Report 20 Match",
      "Spouse",
      "Beneficiaries",
      "Created",
    ],
    async (emit) => {
      let cursor: number | undefined;
      let total = 0;
      do {
        const rows = await prisma.member.findMany({
          where: memberScope(user),
          select: {
            id: true,
            controllerId: true,
            fullName: true,
            ghanaCardId: true,
            school: true,
            status: true,
            report20Matched: true,
            createdAt: true,
            district: {
              select: { name: true, region: { select: { name: true } } },
            },
            spouse: { select: { id: true } },
            _count: { select: { beneficiaries: true } },
          },
          orderBy: { id: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const row of rows) {
          await emit([
            row.controllerId,
            row.fullName,
            row.ghanaCardId,
            row.school,
            row.district?.name ?? "Unassigned",
            row.district?.region.name ?? "",
            row.status,
            row.report20Matched ? "Matched" : "Not matched",
            row.spouse ? "Yes" : "No",
            row._count.beneficiaries,
            row.createdAt,
          ]);
        }
        total += rows.length;
        cursor = rows.at(-1)?.id;
        if (rows.length < BATCH_SIZE) break;
      } while (cursor);
      return total;
    },
  );
});

// Report 20's own POV: every row from the most recent (or a specified) reconciliation run,
// including the ones that never became members — a member-table query can't produce this, since
// UNMATCHED/DUPLICATE/INVALID rows that couldn't be auto-enrolled have no member to join to.
// Restricted to SUPER_ADMIN/NATIONAL_ADMIN: Report 20 rows aren't reliably scopable by district —
// only rows that resolved to a member have district context, and that's exactly the subset this
// report exists to show beyond. This matches who can manage Report 20 imports in the first place.
reportRouter.get(
  "/reconciliation.csv",
  authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN"),
  async (request, response) => {
    const jobIdParam = Number(request.query.importJobId);
    const job = await prisma.importJob.findFirst({
      where: {
        type: "REPORT_20",
        ...(Number.isInteger(jobIdParam) && jobIdParam > 0
          ? { id: jobIdParam }
          : { status: "COMPLETED" }),
      },
      select: { id: true, file: { select: { originalName: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (!job) {
      response
        .status(404)
        .json({ success: false, message: "No Report 20 import was found" });
      return;
    }
    await sendReport(
      request,
      response,
      "report-20-reconciliation.csv",
      [
        "Row",
        "Controller ID",
        "Full Name",
        "School",
        "District (file)",
        "Status",
        "Issues",
        "Linked Member ID",
      ],
      async (emit) => {
        let cursor: number | undefined;
        let total = 0;
        do {
          const rows = await prisma.report20Row.findMany({
            where: { importJobId: job.id },
            select: {
              id: true,
              rowNumber: true,
              controllerId: true,
              fullName: true,
              school: true,
              districtName: true,
              status: true,
              issues: true,
              memberId: true,
            },
            orderBy: { id: "asc" },
            take: BATCH_SIZE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          });
          for (const row of rows) {
            await emit([
              row.rowNumber,
              row.controllerId,
              row.fullName,
              row.school,
              row.districtName,
              row.status,
              (row.issues as string[] | null)?.join("; ") ?? "",
              row.memberId,
            ]);
          }
          total += rows.length;
          cursor = rows.at(-1)?.id;
          if (rows.length < BATCH_SIZE) break;
        } while (cursor);
        return total;
      },
    );
  },
);

reportRouter.get("/transfers.csv", async (request, response) => {
  const user = currentUser(response);
  await sendReport(
    request,
    response,
    "transfers.csv",
    [
      "Transfer ID",
      "Controller ID",
      "Member",
      "From District",
      "To District",
      "Requested",
      "Effective",
      "Status",
      "Reason",
      "Review Note",
    ],
    async (emit) => {
      let cursor: number | undefined;
      let total = 0;
      do {
        const rows = await prisma.memberTransfer.findMany({
          where: transferScope(user),
          include: {
            member: { select: { controllerId: true, fullName: true } },
            fromDistrict: { select: { name: true } },
            toDistrict: { select: { name: true } },
          },
          orderBy: { id: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const row of rows)
          await emit([
            row.id,
            row.member.controllerId,
            row.member.fullName,
            row.fromDistrict.name,
            row.toDistrict.name,
            row.requestedAt,
            row.effectiveAt,
            row.status,
            row.reason,
            row.reviewNote,
          ]);
        total += rows.length;
        cursor = rows.at(-1)?.id;
        if (rows.length < BATCH_SIZE) break;
      } while (cursor);
      return total;
    },
  );
});

reportRouter.get("/removals.csv", async (request, response) => {
  const user = currentUser(response);
  await sendReport(
    request,
    response,
    "removed-members.csv",
    [
      "Controller ID",
      "Full Name",
      "School",
      "District",
      "Region",
      "Last Updated",
    ],
    async (emit) => {
      let cursor: number | undefined;
      let total = 0;
      do {
        const rows = await prisma.member.findMany({
          where: { ...memberScope(user), status: "REMOVED" },
          select: {
            id: true,
            controllerId: true,
            fullName: true,
            school: true,
            updatedAt: true,
            district: {
              select: { name: true, region: { select: { name: true } } },
            },
          },
          orderBy: { id: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const row of rows)
          await emit([
            row.controllerId,
            row.fullName,
            row.school,
            row.district?.name ?? "Unassigned",
            row.district?.region.name ?? "",
            row.updatedAt,
          ]);
        total += rows.length;
        cursor = rows.at(-1)?.id;
        if (rows.length < BATCH_SIZE) break;
      } while (cursor);
      return total;
    },
  );
});

reportRouter.get("/claims.csv", async (request, response) => {
  const user = currentUser(response);
  await sendReport(
    request,
    response,
    "claims.csv",
    [
      "Submission ID",
      "External Claim ID",
      "Controller ID",
      "Member",
      "Provider",
      "Status",
      "Submitted",
      "Last Synchronized",
      "Error",
    ],
    async (emit) => {
      let cursor: number | undefined;
      let total = 0;
      do {
        const rows = await prisma.externalClaimSubmission.findMany({
          where: { member: { is: memberScope(user) } },
          include: {
            member: { select: { controllerId: true, fullName: true } },
          },
          orderBy: { id: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const row of rows)
          await emit([
            row.id,
            row.externalClaimId,
            row.member.controllerId,
            row.member.fullName,
            row.provider,
            row.status,
            row.submittedAt,
            row.lastSyncedAt,
            row.errorMessage,
          ]);
        total += rows.length;
        cursor = rows.at(-1)?.id;
        if (rows.length < BATCH_SIZE) break;
      } while (cursor);
      return total;
    },
  );
});
