import { once } from "node:events";

import { Router, type Request, type Response } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { recordAudit } from "../audit/audit.service.js";
import { memberScope } from "../members/member.access.js";

export const reportRouter = Router();

const BATCH_SIZE = 1_000;

function currentUser(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

function csvCell(value: unknown) {
  if (value == null) return "";
  let text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
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
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
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
    ["Controller ID", "Full Name", "Ghana Card ID", "School", "District", "Region", "Status", "Report 20 Match", "Spouse", "Beneficiaries", "Created"],
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
            district: { select: { name: true, region: { select: { name: true } } } },
            spouse: { select: { id: true } },
            _count: { select: { beneficiaries: true } },
          },
          orderBy: { id: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const row of rows) {
          await emit([row.controllerId, row.fullName, row.ghanaCardId, row.school, row.district.name, row.district.region.name, row.status, row.report20Matched ? "Matched" : "Not matched", row.spouse ? "Yes" : "No", row._count.beneficiaries, row.createdAt]);
        }
        total += rows.length;
        cursor = rows.at(-1)?.id;
        if (rows.length < BATCH_SIZE) break;
      } while (cursor);
      return total;
    },
  );
});

reportRouter.get("/reconciliation.csv", async (request, response) => {
  const user = currentUser(response);
  await sendReport(
    request,
    response,
    "report-20-reconciliation.csv",
    ["Controller ID", "Full Name", "School", "District", "Region", "Member Status", "Report 20 Status"],
    async (emit) => {
      let cursor: number | undefined;
      let total = 0;
      do {
        const rows = await prisma.member.findMany({
          where: memberScope(user),
          select: { id: true, controllerId: true, fullName: true, school: true, status: true, report20Matched: true, district: { select: { name: true, region: { select: { name: true } } } } },
          orderBy: { id: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const row of rows) await emit([row.controllerId, row.fullName, row.school, row.district.name, row.district.region.name, row.status, row.report20Matched ? "MATCHED" : "UNMATCHED"]);
        total += rows.length;
        cursor = rows.at(-1)?.id;
        if (rows.length < BATCH_SIZE) break;
      } while (cursor);
      return total;
    },
  );
});

reportRouter.get("/transfers.csv", async (request, response) => {
  const user = currentUser(response);
  await sendReport(
    request,
    response,
    "transfers.csv",
    ["Transfer ID", "Controller ID", "Member", "From District", "To District", "Requested", "Effective", "Status", "Reason", "Review Note"],
    async (emit) => {
      let cursor: number | undefined;
      let total = 0;
      do {
        const rows = await prisma.memberTransfer.findMany({
          where: transferScope(user),
          include: { member: { select: { controllerId: true, fullName: true } }, fromDistrict: { select: { name: true } }, toDistrict: { select: { name: true } } },
          orderBy: { id: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const row of rows) await emit([row.id, row.member.controllerId, row.member.fullName, row.fromDistrict.name, row.toDistrict.name, row.requestedAt, row.effectiveAt, row.status, row.reason, row.reviewNote]);
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
    ["Controller ID", "Full Name", "School", "District", "Region", "Last Updated"],
    async (emit) => {
      let cursor: number | undefined;
      let total = 0;
      do {
        const rows = await prisma.member.findMany({
          where: { ...memberScope(user), status: "REMOVED" },
          select: { id: true, controllerId: true, fullName: true, school: true, updatedAt: true, district: { select: { name: true, region: { select: { name: true } } } } },
          orderBy: { id: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const row of rows) await emit([row.controllerId, row.fullName, row.school, row.district.name, row.district.region.name, row.updatedAt]);
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
    ["Submission ID", "External Claim ID", "Controller ID", "Member", "Provider", "Status", "Submitted", "Last Synchronized", "Error"],
    async (emit) => {
      let cursor: number | undefined;
      let total = 0;
      do {
        const rows = await prisma.externalClaimSubmission.findMany({
          where: { member: { is: memberScope(user) } },
          include: { member: { select: { controllerId: true, fullName: true } } },
          orderBy: { id: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const row of rows) await emit([row.id, row.externalClaimId, row.member.controllerId, row.member.fullName, row.provider, row.status, row.submittedAt, row.lastSyncedAt, row.errorMessage]);
        total += rows.length;
        cursor = rows.at(-1)?.id;
        if (rows.length < BATCH_SIZE) break;
      } while (cursor);
      return total;
    },
  );
});
