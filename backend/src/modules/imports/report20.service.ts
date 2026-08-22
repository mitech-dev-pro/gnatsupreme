import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

import ExcelJS from "exceljs";
import type { Prisma } from "../../generated/prisma/client.js";

import { prisma } from "../../lib/prisma.js";
import { normalizeDistrictName, resolveDistrict } from "../geography/district-match.js";

const MAX_ROWS = 300_000;

type SourceRow = {
  rowNumber: number;
  rawData: Record<string, string>;
  controllerId: string | null;
  fullName: string | null;
  districtName: string | null;
  regionName: string | null;
  school: string | null;
  ghanaCardId: string | null;
};

const aliases = {
  controllerId: ["controllerid", "controller", "employeeno", "employeenumber", "staffid"],
  fullName: ["fullname", "name", "membername", "employeename", "nameofemployee"],
  districtName: ["district", "districtname", "municipality", "mmda"],
  regionName: ["region", "regionname"],
  school: ["school", "schoolname", "institution", "managementunit"],
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

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
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
      regionName: field(rawData, aliases.regionName),
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
    data: { status: "PROCESSING", startedAt: new Date(), totalRows: sourceRows.length, processedRows: 0 },
  });

  const controllerIds = [
    ...new Set(
      sourceRows
        .map((row) => row.controllerId?.replace(/\s+/g, ""))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [members, districts, districtAliases, activeMembers] = await Promise.all([
    prisma.member.findMany({
      where: { controllerId: { in: controllerIds } },
      include: { district: { select: { name: true } } },
    }),
    prisma.district.findMany({ include: { region: { select: { name: true } } } }),
    prisma.districtAlias.findMany({ select: { alias: true, districtId: true } }),
    // Report 20 is treated as the full national payroll file, so any currently-recognized
    // member (ACTIVE or already-FLAGGED) not seen in this run is presumed missing from payroll.
    // PENDING/RETURNED/REMOVED members are excluded — they aren't expected to appear yet, or
    // are already off the books.
    prisma.member.findMany({
      where: { status: { in: ["ACTIVE", "FLAGGED"] } },
      select: { id: true, controllerId: true, missingFromReport20At: true },
    }),
  ]);
  const membersByControllerId = new Map(members.map((member) => [member.controllerId, member]));
  const aliasMap = new Map(districtAliases.map((entry) => [normalizeDistrictName(entry.alias), entry.districtId]));
  const seen = new Set<string>();
  const matchedMemberIds = new Set<number>();
  const changedMemberIds = new Set<number>();
  const enrolledDistrictIds = new Map<string, number>();
  const counts = { matched: 0, changed: 0, unmatched: 0, duplicate: 0, invalid: 0, enrolled: 0 };
  const nextControllerIdToCreate: { controllerId: string; data: Prisma.MemberCreateManyInput }[] = [];

  function classifyRow(row: SourceRow): Prisma.Report20RowCreateManyInput {
    const issues: string[] = [];
    let status: "MATCHED" | "CHANGED" | "UNMATCHED" | "DUPLICATE" | "INVALID" | "ENROLLED";
    const controllerId = row.controllerId?.replace(/\s+/g, "") ?? null;
    const member = controllerId ? membersByControllerId.get(controllerId) : undefined;

    if (!controllerId || !/^\d{4,7}$/.test(controllerId) || !row.fullName) {
      status = "INVALID";
      if (!controllerId) issues.push("Controller ID is required");
      else if (!/^\d{4,7}$/.test(controllerId)) issues.push("Controller ID must contain 4 to 7 digits");
      if (!row.fullName) issues.push("Full name is required");
    } else if (seen.has(controllerId)) {
      status = "DUPLICATE";
      issues.push("Controller ID appears more than once in this file");
    } else if (!member) {
      // A Controller ID that's genuinely new gets auto-enrolled as ACTIVE, using only what
      // Report 20 provides — beneficiary/Ghana Card/DOB/phone are left blank for staff to fill in later.
      const { district, ambiguous } = row.districtName
        ? resolveDistrict(row.districtName, row.regionName, districts, aliasMap)
        : { district: null, ambiguous: false };
      if (!district) {
        status = "UNMATCHED";
        issues.push(
          !row.districtName
            ? "New member could not be auto-enrolled: district is required"
            : ambiguous
              ? "New member could not be auto-enrolled: district is ambiguous"
              : "New member could not be auto-enrolled: district was not found",
        );
      } else {
        status = "ENROLLED";
        enrolledDistrictIds.set(controllerId, district.id);
        issues.push("Auto-enrolled from Report 20 as a new active member");
      }
    } else {
      if (normalizeValue(row.fullName) !== normalizeValue(member.fullName)) issues.push("Full name differs");
      if (row.school && normalizeValue(row.school) !== normalizeValue(member.school)) issues.push("School differs");
      // Resolved through the same alias/suffix matching as new-member enrollment, not a raw string
      // compare — otherwise a district that only differs by an aliased spelling (e.g. "Sagnerigu" vs
      // the member's actual "Sagnarigu") would wrongly flag as CHANGED every single run, even though
      // it refers to the same district.
      if (row.districtName) {
        const { district: resolvedDistrict } = resolveDistrict(row.districtName, row.regionName, districts, aliasMap);
        if (!resolvedDistrict || resolvedDistrict.id !== member.districtId) issues.push("District differs");
      }
      if (row.ghanaCardId && normalizeValue(row.ghanaCardId) !== normalizeValue(member.ghanaCardId)) issues.push("Ghana Card ID differs");
      status = issues.length ? "CHANGED" : "MATCHED";
      // Only a clean match counts toward report20Matched — CHANGED means the row was found but
      // the data disagrees with what's on file, which still needs staff review before it's "matched".
      // report20Matched must move both ways: a member matched in an earlier run who now comes back
      // CHANGED (or drops out of the file entirely — see missingMemberIds below) needs the flag
      // cleared, otherwise it silently goes stale and no longer reflects the latest reconciliation.
      if (status === "MATCHED") matchedMemberIds.add(member.id);
      else changedMemberIds.add(member.id);
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
  }

  // Classifying every row is the dominant cost on a rerun of an already-populated dataset (most
  // rows just re-match an existing member), so it's what processedRows tracks — chunked with
  // periodic progress writes instead of one big synchronous .map(), so the frontend's progress bar
  // actually moves instead of sitting still until the very end.
  const CLASSIFY_BATCH_SIZE = 5_000;
  const data: Prisma.Report20RowCreateManyInput[] = [];
  let classifiedSoFar = 0;
  for (const rowBatch of chunk(sourceRows, CLASSIFY_BATCH_SIZE)) {
    for (const row of rowBatch) data.push(classifyRow(row));
    classifiedSoFar += rowBatch.length;
    await prisma.importJob.update({ where: { id: importJobId }, data: { processedRows: classifiedSoFar } });
  }

  // Newly-enrolled members need real ids before the Report20Row rows can reference them, so
  // create them first and then patch memberId onto the corresponding row payloads.
  const enrolledRowsByControllerId = new Map(
    data.filter((row) => row.status === "ENROLLED" && row.controllerId).map((row) => [row.controllerId as string, row]),
  );
  for (const [controllerId, districtId] of enrolledDistrictIds) {
    const row = enrolledRowsByControllerId.get(controllerId);
    if (!row) continue;
    nextControllerIdToCreate.push({
      controllerId,
      data: {
        controllerId,
        fullName: row.fullName as string,
        school: (row.school as string | null) ?? "",
        districtId,
        status: "ACTIVE",
        report20Matched: true,
      },
    });
  }

  // Auto-enrolling new members is done as its own batched phase ahead of the final transaction —
  // bulk insert per batch instead of N individual creates — rather than a progress-reporting one:
  // processedRows already reflects rows classified (see above), and new enrollments are a subset
  // of those rows, so writing a smaller "enrolled so far" count here would make the progress bar
  // rewind partway through instead of finishing at 100%.
  const createdIdByControllerId = new Map<string, number>();
  const ENROLL_BATCH_SIZE = 2_000;
  for (const batch of chunk(nextControllerIdToCreate, ENROLL_BATCH_SIZE)) {
    const created = await prisma.member.createManyAndReturn({
      data: batch.map((entry) => entry.data),
      select: { id: true, controllerId: true },
    });
    for (const member of created) createdIdByControllerId.set(member.controllerId, member.id);
  }
  for (const row of data) {
    if (row.status === "ENROLLED" && row.controllerId) {
      row.memberId = createdIdByControllerId.get(row.controllerId);
    }
  }

  const seenControllerIds = seen;
  const missingMemberIds = activeMembers
    .filter((member) => !seenControllerIds.has(member.controllerId))
    .map((member) => member.id);
  const reappearedMemberIds = activeMembers
    .filter((member) => seenControllerIds.has(member.controllerId) && member.missingFromReport20At)
    .map((member) => member.id);

  await prisma.$transaction(
    async (tx) => {
      // Clears any rows from a previous run of this same job (see rerunReport20) before inserting fresh ones.
      await tx.report20Row.deleteMany({ where: { importJobId } });
      for (const batch of chunk(data, 20_000)) await tx.report20Row.createMany({ data: batch });
      await tx.member.updateMany({ where: { id: { in: [...matchedMemberIds] } }, data: { report20Matched: true } });
      // Anything that used to be matched but isn't any more this run — now CHANGED, or missing
      // from the file entirely — has its flag cleared so it doesn't keep reporting as matched
      // against a file that no longer agrees with it.
      const noLongerMatchedIds = [...new Set([...changedMemberIds, ...missingMemberIds])];
      if (noLongerMatchedIds.length) {
        await tx.member.updateMany({ where: { id: { in: noLongerMatchedIds } }, data: { report20Matched: false } });
      }
      if (missingMemberIds.length) {
        await tx.member.updateMany({ where: { id: { in: missingMemberIds } }, data: { missingFromReport20At: new Date() } });
      }
      if (reappearedMemberIds.length) {
        await tx.member.updateMany({ where: { id: { in: reappearedMemberIds } }, data: { missingFromReport20At: null } });
      }
      await tx.importJob.update({
        where: { id: importJobId },
        data: {
          status: "COMPLETED",
          totalRows: sourceRows.length,
          processedRows: sourceRows.length,
          matchedRows: counts.matched,
          changedRows: counts.changed,
          unmatchedRows: counts.unmatched,
          duplicateRows: counts.duplicate,
          invalidRows: counts.invalid,
          enrolledRows: counts.enrolled,
          flaggedForRemovalRows: missingMemberIds.length,
          completedAt: new Date(),
        },
      });
    },
    // Default 5s timeout is far too short for inserting up to MAX_ROWS rows; the job now runs
    // off the HTTP request path (see import.routes.ts), so there's no user-facing timeout pressure.
    { timeout: 600_000 },
  );
}
