import ExcelJS from "exceljs";
import type { Prisma } from "../../generated/prisma/client.js";

import { prisma } from "../../lib/prisma.js";
import type { AuthenticatedUser } from "../../middleware/authenticate.js";

const MAX_ROWS = 50_000;
const aliases = {
  controllerId: ["controllerid", "employeeno", "employeenumber", "staffid"],
  fullName: ["fullname", "nameofemployee", "employeename", "name"],
  school: ["school", "schoolname", "managementunit", "institution"],
  district: ["district", "districtname", "municipality", "mmda"],
  region: ["region", "regionname"],
  dateOfBirth: ["dateofbirth", "dob"],
  ghanaCardId: ["ghanacardid", "ghanacard", "nationalid"],
  phone: ["phone", "phonenumber", "mobile"],
  spouseName: ["spousename", "spousefullname"],
  spouseDateOfBirth: ["spousedateofbirth", "spousedob"],
  spouseGhanaCardId: ["spouseghanacardid", "spouseghanacard"],
  beneficiaryName: ["beneficiaryname", "beneficiaryfullname"],
  beneficiaryRelationship: ["beneficiaryrelationship", "relationship"],
  beneficiaryDateOfBirth: ["beneficiarydateofbirth", "beneficiarydob"],
  trusteeName: ["trusteename"],
  trusteeGhanaCardId: ["trusteeghanacardid", "trusteeghanacard"],
} as const;

type RawRow = { rowNumber: number; data: Record<string, string> };

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readField(data: Record<string, string>, names: readonly string[]) {
  return Object.entries(data).find(([key]) => names.some((name) => name === normalized(key)))?.[1]?.trim() || null;
}

function parseDate(value: string | null, label: string, issues: string[]) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date > new Date()) {
    issues.push(`${label} is invalid`);
    return null;
  }
  return date;
}

function parseRelationship(value: string | null) {
  const relationship = value?.trim().toUpperCase().replaceAll(" ", "_");
  return ["CHILD", "SPOUSE", "PARENT", "SIBLING", "OTHER"].includes(relationship ?? "")
    ? (relationship as "CHILD" | "SPOUSE" | "PARENT" | "SIBLING" | "OTHER")
    : null;
}

async function spreadsheetRows(filePath: string, mimeType: string): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") await workbook.xlsx.readFile(filePath);
  else await workbook.csv.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) throw new Error("The file has no data rows");
  if (sheet.rowCount - 1 > MAX_ROWS) throw new Error(`An import may contain at most ${MAX_ROWS} rows`);
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column] = cell.text.trim() || `Column ${column}`;
  });
  for (const required of [aliases.controllerId, aliases.fullName, aliases.school, aliases.district]) {
    if (!headers.some((header) => required.some((name) => name === normalized(header)))) {
      throw new Error("Controller ID, Full Name, School, and District columns are required");
    }
  }
  const rows: RawRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const data: Record<string, string> = {};
    headers.forEach((header, column) => {
      if (header && column > 0) data[header] = sheet.getRow(rowNumber).getCell(column).text.trim();
    });
    if (Object.values(data).some(Boolean)) rows.push({ rowNumber, data });
  }
  if (!rows.length) throw new Error("The file has no data rows");
  return rows;
}

export async function stageMemberImport(jobId: number, filePath: string, mimeType: string, user: AuthenticatedUser) {
  const sourceRows = await spreadsheetRows(filePath, mimeType);
  const districts = await prisma.district.findMany({ include: { region: { select: { name: true } } } });
  const controllerIds = sourceRows.map((row) => readField(row.data, aliases.controllerId)?.replace(/\s/g, "")).filter((id): id is string => Boolean(id));
  const ghanaCards = sourceRows.flatMap((row) => [readField(row.data, aliases.ghanaCardId)?.toUpperCase(), readField(row.data, aliases.spouseGhanaCardId)?.toUpperCase()]).filter((id): id is string => Boolean(id));
  const [existingMembers, existingCards, existingSpouseCards, reportRows] = await Promise.all([
    prisma.member.findMany({ where: { controllerId: { in: controllerIds } }, select: { id: true, controllerId: true } }),
    prisma.member.findMany({ where: { ghanaCardId: { in: ghanaCards } }, select: { ghanaCardId: true } }),
    prisma.spouse.findMany({ where: { ghanaCardId: { in: ghanaCards } }, select: { ghanaCardId: true } }),
    prisma.report20Row.findMany({ where: { controllerId: { in: controllerIds }, importJob: { status: "COMPLETED" } }, select: { controllerId: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const existingIds = new Set(existingMembers.map((member) => member.controllerId));
  const usedCards = new Set([...existingCards, ...existingSpouseCards].map((record) => record.ghanaCardId).filter(Boolean));
  const reportIds = new Set(reportRows.map((row) => row.controllerId).filter(Boolean));
  const seenIds = new Set<string>();
  const seenCards = new Set<string>();
  const counts = { READY: 0, INVALID: 0, DUPLICATE: 0, EXISTING: 0, OUT_OF_SCOPE: 0 };

  const rows: Prisma.MemberBulkImportRowCreateManyInput[] = sourceRows.map(({ rowNumber, data }) => {
    const issues: string[] = [];
    const controllerId = readField(data, aliases.controllerId)?.replace(/\s/g, "") ?? null;
    const fullName = readField(data, aliases.fullName);
    const school = readField(data, aliases.school);
    const districtName = readField(data, aliases.district);
    const regionName = readField(data, aliases.region);
    const ghanaCardId = readField(data, aliases.ghanaCardId)?.toUpperCase() ?? null;
    const candidates = districts.filter((district) => normalized(district.name) === normalized(districtName ?? "") && (!regionName || normalized(district.region.name) === normalized(regionName)));
    const district = candidates.length === 1 ? candidates[0] : null;
    const beneficiaryName = readField(data, aliases.beneficiaryName);
    const relationshipValue = readField(data, aliases.beneficiaryRelationship);
    const relationship = parseRelationship(relationshipValue);
    const spouseName = readField(data, aliases.spouseName);
    const spouseGhanaCardId = readField(data, aliases.spouseGhanaCardId)?.toUpperCase() ?? null;
    const trusteeGhanaCardId = readField(data, aliases.trusteeGhanaCardId)?.toUpperCase() ?? null;
    const dateOfBirth = parseDate(readField(data, aliases.dateOfBirth), "Date of birth", issues);
    parseDate(readField(data, aliases.spouseDateOfBirth), "Spouse date of birth", issues);
    parseDate(readField(data, aliases.beneficiaryDateOfBirth), "Beneficiary date of birth", issues);
    if (!controllerId || !/^\d{9}$/.test(controllerId)) issues.push("Controller ID must contain exactly 9 digits");
    if (!fullName || fullName.length < 2) issues.push("Full name is required");
    if (!school || school.length < 2) issues.push("School is required");
    if (!districtName) issues.push("District is required");
    else if (!district) issues.push(candidates.length > 1 ? "District is ambiguous; include Region" : "District was not found");
    if (!beneficiaryName) issues.push("Beneficiary name is required");
    if (!relationship) issues.push("Beneficiary relationship must be CHILD, SPOUSE, PARENT, SIBLING, or OTHER");
    if (ghanaCardId && !/^GHA-\d{9}-\d$/.test(ghanaCardId)) issues.push("Ghana Card ID has an invalid format");
    if (spouseGhanaCardId && !spouseName) issues.push("Spouse name is required when spouse details are provided");
    if (spouseGhanaCardId && !/^GHA-\d{9}-\d$/.test(spouseGhanaCardId)) issues.push("Spouse Ghana Card ID has an invalid format");
    if (trusteeGhanaCardId && !/^GHA-\d{9}-\d$/.test(trusteeGhanaCardId)) issues.push("Trustee Ghana Card ID has an invalid format");
    if (ghanaCardId && spouseGhanaCardId === ghanaCardId) issues.push("Member and spouse cannot use the same Ghana Card ID");

    let status: keyof typeof counts = "READY";
    if (issues.length) status = "INVALID";
    else if (controllerId && seenIds.has(controllerId)) {
      status = "DUPLICATE";
      issues.push("Controller ID appears more than once in this file");
    } else if (ghanaCardId && seenCards.has(ghanaCardId)) {
      status = "DUPLICATE";
      issues.push("Ghana Card ID appears more than once in this file");
    } else if (spouseGhanaCardId && seenCards.has(spouseGhanaCardId)) {
      status = "DUPLICATE";
      issues.push("Spouse Ghana Card ID appears more than once in this file");
    } else if (controllerId && existingIds.has(controllerId)) {
      status = "EXISTING";
      issues.push("Controller ID is already enrolled");
    } else if (ghanaCardId && usedCards.has(ghanaCardId)) {
      status = "EXISTING";
      issues.push("Ghana Card ID is already enrolled");
    } else if (spouseGhanaCardId && usedCards.has(spouseGhanaCardId)) {
      status = "EXISTING";
      issues.push("Spouse Ghana Card ID is already enrolled");
    } else if (district && ((user.role === "DISTRICT_ADMIN" && district.id !== user.districtId) || (user.role === "REGIONAL_ADMIN" && district.regionId !== user.regionId))) {
      status = "OUT_OF_SCOPE";
      issues.push("You cannot enroll members in this district");
    }
    if (controllerId) seenIds.add(controllerId);
    if (ghanaCardId) seenCards.add(ghanaCardId);
    if (spouseGhanaCardId) seenCards.add(spouseGhanaCardId);
    counts[status] += 1;
    return {
      importJobId: jobId,
      rowNumber,
      controllerId,
      fullName,
      school,
      districtName,
      districtId: district?.id,
      dateOfBirth,
      ghanaCardId,
      phone: readField(data, aliases.phone),
      report20Matched: controllerId ? reportIds.has(controllerId) : false,
      status,
      issues,
      rawData: data,
    };
  });
  await prisma.$transaction([
    prisma.memberBulkImportRow.createMany({ data: rows }),
    prisma.importJob.update({ where: { id: jobId }, data: { status: "COMPLETED", totalRows: rows.length, readyRows: counts.READY, invalidRows: counts.INVALID, duplicateRows: counts.DUPLICATE, unmatchedRows: counts.EXISTING + counts.OUT_OF_SCOPE, completedAt: new Date() } }),
  ]);
}

export function bulkRawFields(raw: Prisma.JsonValue) {
  const data = raw as Record<string, string>;
  return {
    spouseName: readField(data, aliases.spouseName),
    spouseDateOfBirth: readField(data, aliases.spouseDateOfBirth),
    spouseGhanaCardId: readField(data, aliases.spouseGhanaCardId)?.toUpperCase() ?? null,
    beneficiaryName: readField(data, aliases.beneficiaryName),
    beneficiaryRelationship: parseRelationship(readField(data, aliases.beneficiaryRelationship)),
    beneficiaryDateOfBirth: readField(data, aliases.beneficiaryDateOfBirth),
    trusteeName: readField(data, aliases.trusteeName),
    trusteeGhanaCardId: readField(data, aliases.trusteeGhanaCardId)?.toUpperCase() ?? null,
  };
}
