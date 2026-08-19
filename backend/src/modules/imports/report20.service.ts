import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

import ExcelJS from "exceljs";
import type { Prisma } from "../../generated/prisma/client.js";

import { prisma } from "../../lib/prisma.js";

const MAX_ROWS = 50_000;

type SourceRow = {
  rowNumber: number;
  rawData: Record<string, string>;
  controllerId: string | null;
  fullName: string | null;
  districtName: string | null;
  school: string | null;
  ghanaCardId: string | null;
};

const aliases = {
  controllerId: ["controllerid", "controller", "employeeno", "employeenumber", "staffid"],
  fullName: ["fullname", "name", "membername", "employeename"],
  districtName: ["district", "districtname", "municipality", "mmda"],
  school: ["school", "schoolname", "institution"],
  ghanaCardId: ["ghanacardid", "ghanacard", "nationalid"],
} as const;

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeValue(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function field(rawData: Record<string, string>, names: readonly string[]) {
  const entry = Object.entries(rawData).find(([header]) => names.includes(normalizeHeader(header)));
  return entry?.[1]?.trim() || null;
}

export async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function parseReport20(filePath: string, mimeType: string): Promise<SourceRow[]> {
  const workbook = new ExcelJS.Workbook();
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    await workbook.xlsx.readFile(filePath);
  } else {
    await workbook.csv.readFile(filePath);
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("The file does not contain a worksheet");
  if (worksheet.rowCount < 2) throw new Error("The file has no data rows");
  if (worksheet.rowCount - 1 > MAX_ROWS) throw new Error(`A report may contain at most ${MAX_ROWS} rows`);

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column] = cell.text.trim() || `Column ${column}`;
  });
  if (!headers.some((header) => aliases.controllerId.some((alias) => alias === normalizeHeader(header)))) {
    throw new Error("A Controller ID or Employee No column is required");
  }

  const rows: SourceRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rawData: Record<string, string> = {};
    headers.forEach((header, column) => {
      if (header && column > 0) rawData[header] = row.getCell(column).text.trim();
    });
    if (!Object.values(rawData).some(Boolean)) continue;
    rows.push({
      rowNumber,
      rawData,
      controllerId: field(rawData, aliases.controllerId),
      fullName: field(rawData, aliases.fullName),
      districtName: field(rawData, aliases.districtName),
      school: field(rawData, aliases.school),
      ghanaCardId: field(rawData, aliases.ghanaCardId),
    });
  }
  if (!rows.length) throw new Error("The file has no data rows");
  return rows;
}

export async function reconcileReport20(importJobId: number, sourceRows: SourceRow[]) {
  await prisma.importJob.update({
    where: { id: importJobId },
    data: { status: "PROCESSING", startedAt: new Date() },
  });

  const controllerIds = [
    ...new Set(
      sourceRows
        .map((row) => row.controllerId?.replace(/\s+/g, ""))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const members = await prisma.member.findMany({
    where: { controllerId: { in: controllerIds } },
    include: { district: { select: { name: true } } },
  });
  const membersByControllerId = new Map(members.map((member) => [member.controllerId, member]));
  const seen = new Set<string>();
  const matchedMemberIds = new Set<number>();
  const counts = { matched: 0, changed: 0, unmatched: 0, duplicate: 0, invalid: 0 };

  const data: Prisma.Report20RowCreateManyInput[] = sourceRows.map((row) => {
    const issues: string[] = [];
    let status: "MATCHED" | "CHANGED" | "UNMATCHED" | "DUPLICATE" | "INVALID";
    const controllerId = row.controllerId?.replace(/\s+/g, "") ?? null;
    const member = controllerId ? membersByControllerId.get(controllerId) : undefined;

    if (!controllerId || !/^\d{9}$/.test(controllerId) || !row.fullName) {
      status = "INVALID";
      if (!controllerId) issues.push("Controller ID is required");
      else if (!/^\d{9}$/.test(controllerId)) issues.push("Controller ID must contain exactly 9 digits");
      if (!row.fullName) issues.push("Full name is required");
    } else if (seen.has(controllerId)) {
      status = "DUPLICATE";
      issues.push("Controller ID appears more than once in this file");
    } else if (!member) {
      status = "UNMATCHED";
      issues.push("No registered member has this Controller ID");
    } else {
      if (normalizeValue(row.fullName) !== normalizeValue(member.fullName)) issues.push("Full name differs");
      if (row.school && normalizeValue(row.school) !== normalizeValue(member.school)) issues.push("School differs");
      if (row.districtName && normalizeValue(row.districtName) !== normalizeValue(member.district.name)) issues.push("District differs");
      if (row.ghanaCardId && normalizeValue(row.ghanaCardId) !== normalizeValue(member.ghanaCardId)) issues.push("Ghana Card ID differs");
      status = issues.length ? "CHANGED" : "MATCHED";
      matchedMemberIds.add(member.id);
    }
    if (controllerId) seen.add(controllerId);
    counts[status.toLowerCase() as keyof typeof counts] += 1;

    return {
      importJobId,
      rowNumber: row.rowNumber,
      controllerId,
      fullName: row.fullName,
      districtName: row.districtName,
      school: row.school,
      ghanaCardId: row.ghanaCardId,
      status,
      memberId: member?.id,
      issues,
      rawData: row.rawData,
    };
  });

  await prisma.$transaction([
    prisma.report20Row.createMany({ data }),
    prisma.member.updateMany({
      where: { id: { in: [...matchedMemberIds] } },
      data: { report20Matched: true },
    }),
    prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: "COMPLETED",
        totalRows: sourceRows.length,
        matchedRows: counts.matched,
        changedRows: counts.changed,
        unmatchedRows: counts.unmatched,
        duplicateRows: counts.duplicate,
        invalidRows: counts.invalid,
        completedAt: new Date(),
      },
    }),
  ]);
}
