import type { Prisma } from "../../generated/prisma/client.js";

import { prisma } from "../../lib/prisma.js";
import type { AuthenticatedUser } from "../../middleware/authenticate.js";
import { normalizeDistrictName, resolveDistrict } from "../geography/district-match.js";
import { resolveMemberRegionId } from "../members/member-region.js";
import { cellAt, streamSpreadsheetRows } from "./spreadsheet-stream.js";

const MAX_ROWS = 300_000;
const aliases = {
  controllerId: ["controllerid", "employeeno", "employeenumber", "staffid"],
  fullName: ["fullname", "nameofemployee", "employeename", "name"],
  // Composition fallback only -- used when a file has no fullName-alias column at all (the real
  // non-teaching files split the name this way instead of a single Fullname column).
  surname: ["surname", "sur_name", "lastname"],
  firstname: ["firstname", "first_name", "givenname"],
  otherNames: ["othernames", "other_names", "middlename"],
  school: ["school", "schoolname", "managementunit", "institution"],
  district: ["district", "districtname", "municipality", "mmda"],
  region: ["region", "regionname"],
  ghanaCardId: ["ghanacardid", "ghanacard", "nationalid"],
  phone: ["phone", "phonenumber", "mobile"],
  spouseName: ["spousename", "spousefullname"],
  spouseGhanaCardId: ["spouseghanacardid", "spouseghanacard"],
  beneficiaryName: ["beneficiaryname", "beneficiaryfullname"],
  beneficiaryRelationship: ["beneficiaryrelationship", "relationship"],
  beneficiaryDateOfBirth: ["beneficiarydateofbirth", "beneficiarydob"],
  trusteeName: ["trusteename"],
  employmentCategory: ["employmentcategory", "stafftype"],
  gender: ["gender", "sex"],
  // Free-text workplace for a NON_TEACHING row with no real district.
  placeOfWork: ["placeofwork", "workplace", "stationname"],
} as const;

type RawRow = { rowNumber: number; data: Record<string, string> };

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readField(data: Record<string, string>, names: readonly string[]) {
  return (
    Object.entries(data)
      .find(([key]) => names.some((name) => name === normalized(key)))?.[1]
      ?.trim() || null
  );
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

function parseGender(value: string | null) {
  const normalizedValue = value?.trim().toLowerCase();
  if (normalizedValue === "male" || normalizedValue === "m") return "MALE" as const;
  if (normalizedValue === "female" || normalizedValue === "f") return "FEMALE" as const;
  return null;
}

// Explicit-column-only parse; the job-level default and per-row inference (both of which need
// more context than a single cell) are applied by the caller, not here.
function parseExplicitEmploymentCategory(value: string | null) {
  const normalizedValue = value?.trim().toLowerCase().replace(/[\s-]/g, "");
  if (normalizedValue === "nonteaching" || normalizedValue === "nt") return "NON_TEACHING" as const;
  if (normalizedValue === "teaching" || normalizedValue === "t") return "TEACHING" as const;
  return null;
}

function hasColumn(headers: string[], names: readonly string[]) {
  return headers.some((header) => names.some((name) => name === normalized(header)));
}

async function spreadsheetRows(
  filePath: string,
  mimeType: string,
  defaultEmploymentCategory: "TEACHING" | "NON_TEACHING" | null,
): Promise<RawRow[]> {
  let headers: string[] | null = null;
  const rows: RawRow[] = [];
  let dataRowCount = 0;

  for await (const { rowNumber, cells } of streamSpreadsheetRows(filePath, mimeType)) {
    if (rowNumber === 1) {
      headers = [];
      cells.forEach((text, column) => {
        if (column > 0) headers![column] = text.trim() || `Column ${column}`;
      });
      if (!hasColumn(headers, aliases.controllerId)) {
        throw new Error("Controller ID column is required");
      }
      const hasFullName =
        hasColumn(headers, aliases.fullName) ||
        (hasColumn(headers, aliases.surname) && hasColumn(headers, aliases.firstname));
      if (!hasFullName) {
        throw new Error("Full Name (or Surname/Firstname) columns are required");
      }
      // School/District are only required when this file wasn't declared non-teaching on the
      // upload screen -- a non-teaching file uses Place of Work instead, and per-row detection
      // (explicit column, still possible even in a "declared teaching" file) can override this.
      if (defaultEmploymentCategory !== "NON_TEACHING") {
        for (const required of [aliases.school, aliases.district]) {
          if (!hasColumn(headers, required)) {
            throw new Error("School and District columns are required for teaching staff");
          }
        }
      }
      continue;
    }

    dataRowCount += 1;
    if (dataRowCount > MAX_ROWS) throw new Error(`An import may contain at most ${MAX_ROWS} rows`);

    const data: Record<string, string> = {};
    headers!.forEach((header, column) => {
      if (header && column > 0) data[header] = cellAt(cells, column);
    });
    if (Object.values(data).some(Boolean)) rows.push({ rowNumber, data });
  }
  if (!headers || !rows.length) throw new Error("The file has no data rows");
  return rows;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Postgres caps bind parameters at 65535 per query; batch large `IN (...)` lookups to stay well under that.
async function findManyChunked<T>(
  ids: string[],
  run: (batch: string[]) => Promise<T[]>,
): Promise<T[]> {
  const BATCH_SIZE = 10_000;
  const results = await Promise.all(chunk(ids, BATCH_SIZE).map(run));
  return results.flat();
}

export async function stageMemberImport(
  jobId: number,
  filePath: string,
  mimeType: string,
  user: AuthenticatedUser,
) {
  const job = await prisma.importJob.findUniqueOrThrow({
    where: { id: jobId },
    select: { defaultEmploymentCategory: true, defaultRegionId: true },
  });
  const sourceRows = await spreadsheetRows(filePath, mimeType, job.defaultEmploymentCategory);
  await prisma.importJob.update({
    where: { id: jobId },
    data: { totalRows: sourceRows.length, processedRows: 0 },
  });
  const districts = await prisma.district.findMany({
    include: { region: { select: { name: true } } },
  });
  // For resolving a NON_TEACHING row's region: explicit Region cell (normalized the same way
  // district names are) first, falling back to the job's defaultRegionId / the uploader's own
  // region inside resolveMemberRegionId.
  const regionIdByNormalizedName = new Map(
    districts.map((d) => [normalizeDistrictName(d.region.name), d.regionId]),
  );
  // Computed once for the whole job, not per row -- a DISTRICT_ADMIN's own region (via their
  // fixed district) or a REGIONAL_ADMIN's own regionId. Irrelevant for SUPER_ADMIN/NATIONAL_ADMIN,
  // who supply an explicit region instead (job.defaultRegionId, set from the upload screen).
  const ownRegionId =
    user.role === "REGIONAL_ADMIN"
      ? user.regionId
      : user.role === "DISTRICT_ADMIN"
        ? (districts.find((d) => d.id === user.districtId)?.regionId ?? null)
        : null;
  // DISTRICT_ADMIN always enrolls into their own district -- a district-less NON_TEACHING member
  // would otherwise be invisible on this admin's own list (REGIONAL_ADMIN/SUPER_ADMIN/
  // NATIONAL_ADMIN are the only roles that can create one). Only forced for rows that end up
  // NON_TEACHING with no district of their own; a TEACHING row keeps its normal
  // resolve/out-of-scope behavior unchanged.
  const districtAdminOwnDistrict =
    user.role === "DISTRICT_ADMIN" ? districts.find((d) => d.id === user.districtId) : undefined;
  const districtAliases = await prisma.districtAlias.findMany({
    select: { alias: true, districtId: true },
  });
  const aliasMap = new Map(
    districtAliases.map((entry) => [normalizeDistrictName(entry.alias), entry.districtId]),
  );
  const controllerIds = [
    ...new Set(
      sourceRows
        .map((row) => readField(row.data, aliases.controllerId)?.replace(/\s/g, ""))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const ghanaCards = [
    ...new Set(
      sourceRows
        .flatMap((row) => [
          readField(row.data, aliases.ghanaCardId)?.toUpperCase(),
          readField(row.data, aliases.spouseGhanaCardId)?.toUpperCase(),
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [existingMembers, existingCards, existingSpouseCards, reportRows] = await Promise.all([
    findManyChunked(controllerIds, (batch) =>
      prisma.member.findMany({
        where: { controllerId: { in: batch } },
        select: { id: true, controllerId: true },
      }),
    ),
    findManyChunked(ghanaCards, (batch) =>
      prisma.member.findMany({
        where: { ghanaCardId: { in: batch } },
        select: { ghanaCardId: true },
      }),
    ),
    findManyChunked(ghanaCards, (batch) =>
      prisma.spouse.findMany({
        where: { ghanaCardId: { in: batch } },
        select: { ghanaCardId: true },
      }),
    ),
    findManyChunked(controllerIds, (batch) =>
      prisma.report20Row.findMany({
        where: { controllerId: { in: batch }, importJob: { status: "COMPLETED" } },
        select: { controllerId: true },
        orderBy: { createdAt: "desc" },
      }),
    ),
  ]);
  const existingIds = new Set(existingMembers.map((member) => member.controllerId));
  const usedCards = new Set(
    [...existingCards, ...existingSpouseCards].map((record) => record.ghanaCardId).filter(Boolean),
  );
  const reportIds = new Set(reportRows.map((row) => row.controllerId).filter(Boolean));
  const seenIds = new Set<string>();
  const seenCards = new Set<string>();
  const counts = { READY: 0, INVALID: 0, DUPLICATE: 0, EXISTING: 0, OUT_OF_SCOPE: 0 };

  const rows: Prisma.MemberBulkImportRowCreateManyInput[] = sourceRows.map(
    ({ rowNumber, data }) => {
      const issues: string[] = [];
      const controllerId =
        readField(data, aliases.controllerId)?.replace(/\s/g, "").toUpperCase() ?? null;
      const surname = readField(data, aliases.surname);
      const firstname = readField(data, aliases.firstname);
      const otherNames = readField(data, aliases.otherNames);
      // Fallback only -- a file with a Fullname column matches that first, unchanged.
      const fullName =
        readField(data, aliases.fullName) ??
        (surname && firstname
          ? [firstname, otherNames, surname].filter(Boolean).join(" ")
          : null);
      const districtName = readField(data, aliases.district);
      const regionName = readField(data, aliases.region);
      const ghanaCardId = readField(data, aliases.ghanaCardId)?.toUpperCase() ?? null;
      const { district: resolvedDistrict, ambiguous: districtAmbiguous } = districtName
        ? resolveDistrict(districtName, regionName, districts, aliasMap)
        : { district: null, ambiguous: false };
      const gender = parseGender(readField(data, aliases.gender));
      const placeOfWork = readField(data, aliases.placeOfWork);

      // Category detection, in priority order: explicit per-row column, the job's file-level
      // default (from the upload screen), then inference as a last resort (e.g. a legacy
      // pre-migration job being resumed, or a direct API caller bypassing the upload screen).
      const employmentCategory: "TEACHING" | "NON_TEACHING" =
        parseExplicitEmploymentCategory(readField(data, aliases.employmentCategory)) ??
        job.defaultEmploymentCategory ??
        (placeOfWork && !resolvedDistrict ? "NON_TEACHING" : "TEACHING");
      const isNonTeaching = employmentCategory === "NON_TEACHING";

      // District-admin fix: only for a NON_TEACHING row that didn't otherwise resolve a district
      // -- a TEACHING row keeps its normal resolve/out-of-scope behavior unchanged, and a
      // NON_TEACHING row that *did* name a real district is left as-is too.
      const district =
        isNonTeaching && !resolvedDistrict && districtAdminOwnDistrict
          ? districtAdminOwnDistrict
          : resolvedDistrict;

      const school = isNonTeaching ? "Head Office" : readField(data, aliases.school);
      const beneficiaryName = readField(data, aliases.beneficiaryName);
      const relationshipValue = readField(data, aliases.beneficiaryRelationship);
      const relationship = parseRelationship(relationshipValue);
      const spouseName = readField(data, aliases.spouseName);
      const spouseGhanaCardId = readField(data, aliases.spouseGhanaCardId)?.toUpperCase() ?? null;
      parseDate(
        readField(data, aliases.beneficiaryDateOfBirth),
        "Beneficiary date of birth",
        issues,
      );
      if (!controllerId || !/^[A-Z0-9]{4,20}$/.test(controllerId))
        issues.push("Controller ID must be 4 to 20 letters/digits");
      if (!fullName || fullName.length < 2) issues.push("Full name is required");
      if (!gender) issues.push("Gender must be Male or Female");
      if (isNonTeaching) {
        if (!placeOfWork || placeOfWork.length < 2)
          issues.push("Place of work is required for non-teaching staff");
      } else {
        if (!school || school.length < 2) issues.push("School is required");
        if (!districtName) issues.push("District is required");
        else if (!district)
          issues.push(
            districtAmbiguous ? "District is ambiguous; include Region" : "District was not found",
          );
        if (!beneficiaryName) issues.push("Beneficiary name is required");
        if (!relationship)
          issues.push("Beneficiary relationship must be CHILD, SPOUSE, PARENT, SIBLING, or OTHER");
      }
      if (ghanaCardId && !/^GHA-\d{9}-\d$/.test(ghanaCardId))
        issues.push("Ghana Card ID has an invalid format");
      if (spouseGhanaCardId && !spouseName)
        issues.push("Spouse name is required when spouse details are provided");
      if (spouseGhanaCardId && !/^GHA-\d{9}-\d$/.test(spouseGhanaCardId))
        issues.push("Spouse Ghana Card ID has an invalid format");
      if (ghanaCardId && spouseGhanaCardId === ghanaCardId)
        issues.push("Member and spouse cannot use the same Ghana Card ID");

      let regionId: number | null = null;
      if (isNonTeaching) {
        const regionCellId = regionName
          ? (regionIdByNormalizedName.get(normalizeDistrictName(regionName)) ?? null)
          : null;
        const explicitRegionId: number | null = regionCellId ?? job.defaultRegionId ?? null;
        const resolvedRegion = resolveMemberRegionId(user, {
          districtRegionId: district?.regionId ?? null,
          explicitRegionId,
          ownRegionId,
        });
        if (resolvedRegion.issue) issues.push(resolvedRegion.issue);
        regionId = resolvedRegion.regionId;
      } else if (district) {
        regionId = district.regionId;
      }

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
      } else if (
        district &&
        ((user.role === "DISTRICT_ADMIN" && district.id !== user.districtId) ||
          (user.role === "REGIONAL_ADMIN" && district.regionId !== user.regionId))
      ) {
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
        regionId,
        employmentCategory,
        ghanaCardId,
        phone: readField(data, aliases.phone),
        report20Matched: controllerId ? reportIds.has(controllerId) : false,
        status,
        issues,
        rawData: data,
      };
    },
  );
  await prisma.$transaction(
    [
      prisma.memberBulkImportRow.createMany({ data: rows }),
      prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          totalRows: rows.length,
          processedRows: rows.length,
          readyRows: counts.READY,
          invalidRows: counts.INVALID,
          duplicateRows: counts.DUPLICATE,
          unmatchedRows: counts.EXISTING + counts.OUT_OF_SCOPE,
          completedAt: new Date(),
        },
      }),
    ],
    // Default 5s timeout is far too short for inserting up to MAX_ROWS rows; this now runs off the
    // HTTP request path (see member-import.routes.ts), so there's no user-facing timeout pressure.
    { timeout: 600_000 },
  );
}

export function bulkRawFields(raw: Prisma.JsonValue) {
  const data = raw as Record<string, string>;
  return {
    spouseName: readField(data, aliases.spouseName),
    spouseGhanaCardId: readField(data, aliases.spouseGhanaCardId)?.toUpperCase() ?? null,
    beneficiaryName: readField(data, aliases.beneficiaryName),
    beneficiaryRelationship: parseRelationship(readField(data, aliases.beneficiaryRelationship)),
    beneficiaryDateOfBirth: readField(data, aliases.beneficiaryDateOfBirth),
    trusteeName: readField(data, aliases.trusteeName),
    gender: parseGender(readField(data, aliases.gender)),
    placeOfWork: readField(data, aliases.placeOfWork),
  };
}
