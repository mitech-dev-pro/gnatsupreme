import { randomInt } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import argon2 from "argon2";
import ExcelJS from "exceljs";
import { confirm, input } from "@inquirer/prompts";

import { prisma } from "../src/lib/prisma.js";
import { normalizeGhanaPhone } from "../src/lib/phone.js";
import { tempPasswordExpiryInstant } from "../src/lib/account-setup.js";
import { uniqueViolationField } from "../src/lib/prisma-errors.js";
import { recordAudit } from "../src/modules/audit/audit.service.js";
import { normalizeDistrictName, resolveDistrict } from "../src/modules/geography/district-match.js";
import type { UserRole } from "../src/generated/prisma/enums.js";

// Bulk-creates phone-only GNAT regional/district secretary accounts (S0 in the phone-login
// account-states table: setupRequired, no email, logs in with phone + a generated temp
// password) from the reviewed rollout workbook, and writes a credentials export file
// (name, GNAT title/"level", phone, temp password) for secure distribution.
//
// Input: temp/GNAT_admin_accounts.xlsx, sheet "Accounts" -- the finalized, human-reviewed plan
// (see temp/build_final_report.py and friends for how it was produced). Only rows whose Status
// column is READY are processed by default; CONFIRM rows (resolved, but with a caveat the
// reviewer hasn't signed off on) need --include-confirm; HOLD rows (phone shared between two
// people, or a geography decision still pending) are never processed by this script -- resolve
// those in the workbook first, then re-run.
//
// Safe to re-run: any row whose phone already belongs to an existing User is skipped, so fixing
// a few rows in the workbook and re-running only creates the accounts that are new.
//
// Run with:
//   npx tsx scripts/bulk-create-staff-admins.ts [path/to/Accounts.xlsx] [--include-confirm]

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT_PATH = path.resolve(SCRIPT_DIR, "../../temp/GNAT_admin_accounts.xlsx");
const OUTPUT_DIR = path.resolve(SCRIPT_DIR, "../../temp");

const args = process.argv.slice(2);
const includeConfirm = args.includes("--include-confirm");
const inputPath = args.find((a) => !a.startsWith("--")) ?? DEFAULT_INPUT_PATH;

const ACCEPTED_STATUSES = new Set(includeConfirm ? ["READY", "CONFIRM"] : ["READY"]);
const VALID_ROLES = new Set<UserRole>(["REGIONAL_ADMIN", "DISTRICT_ADMIN"]);

// Avoids characters easily confused on paper or a small phone screen (0/O, 1/l/I) -- these
// passwords are read off a printed/shared list and typed in by hand during first setup.
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SPECIAL = "!@#$%*-_=+?";
const ALL = LOWER + UPPER + DIGITS + SPECIAL;

function pick(alphabet: string) {
  return alphabet[randomInt(alphabet.length)]!;
}

// Satisfies staffPasswordSchema (8+ chars, one each of lower/upper/digit/special) by
// construction, then fills and shuffles rather than rejection-sampling. 16 chars total --
// well above the minimum -- since these are machine-generated, not something a person has to
// remember past their first setup.
function generateTempPassword(): string {
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SPECIAL)];
  const rest = Array.from({ length: 12 }, () => pick(ALL));
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

type SheetRow = Record<string, unknown>;

async function readAccountsSheet(filePath: string): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet("Accounts");
  if (!sheet) throw new Error(`Sheet "Accounts" not found in ${filePath}`);
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });
  const rows: SheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: SheetRow = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber];
      if (header) record[header] = cell.value;
    });
    if (Object.values(record).some((v) => v !== null && v !== undefined && v !== ""))
      rows.push(record);
  });
  return rows;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in (value as Record<string, unknown>)) {
    return String((value as { text: unknown }).text ?? "");
  }
  if (typeof value === "object" && "result" in (value as Record<string, unknown>)) {
    return String((value as { result: unknown }).result ?? "");
  }
  return String(value).trim();
}

function splitNames(value: unknown): string[] {
  return cellText(value)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

type Candidate = {
  personId: string;
  fullName: string;
  level: string;
  role: UserRole;
  phone: string;
  regionIds: number[];
  districtIds: number[];
  geographyLabel: string;
};

type Skip = { personId: string; name: string; reason: string };

async function main() {
  console.log(`Reading ${inputPath} ...`);
  const rows = await readAccountsSheet(inputPath);
  console.log(`${rows.length} data rows found.\n`);

  const regions = await prisma.region.findMany({ select: { id: true, name: true } });
  const districts = await prisma.district.findMany({
    select: { id: true, name: true, regionId: true, region: { select: { name: true } } },
  });
  const regionsByName = new Map(regions.map((r) => [r.name, r]));
  // Same resolution districts/members use for an uploaded file's raw spelling (suffix-strip,
  // then a staff-curated DistrictAlias) -- the Accounts sheet's "App districts" column is
  // already app-side names from an earlier match_districts.py run, but this makes the script
  // resilient to a near-miss (a stray "Municipal" suffix, or a name only known via alias)
  // instead of a spurious "unknown district name" skip.
  const districtAliases = await prisma.districtAlias.findMany({
    select: { alias: true, districtId: true },
  });
  const aliasMap = new Map(
    districtAliases.map((entry) => [normalizeDistrictName(entry.alias), entry.districtId]),
  );

  const candidates: Candidate[] = [];
  const skipped: Skip[] = [];
  const seenPhones = new Map<string, string>(); // phone -> personId, for within-sheet collisions

  for (const row of rows) {
    const personId = cellText(row["Person ID"]) || "(no id)";
    const name = cellText(row["Name"]);
    const status = cellText(row["Status"]).toUpperCase();
    const roleRaw = cellText(row["App role"]);

    if (!ACCEPTED_STATUSES.has(status)) {
      skipped.push({ personId, name, reason: `status is ${status || "(blank)"}, not READY` });
      continue;
    }
    if (!VALID_ROLES.has(roleRaw as UserRole)) {
      skipped.push({ personId, name, reason: `unrecognized App role "${roleRaw}"` });
      continue;
    }
    const role = roleRaw as UserRole;

    const normalizedPhone = normalizeGhanaPhone(cellText(row["Primary phone"]));
    if (!normalizedPhone) {
      skipped.push({
        personId,
        name,
        reason: `invalid primary phone "${cellText(row["Primary phone"])}"`,
      });
      continue;
    }
    if (seenPhones.has(normalizedPhone)) {
      skipped.push({
        personId,
        name,
        reason: `phone ${normalizedPhone} is also used by row ${seenPhones.get(normalizedPhone)} in this sheet`,
      });
      continue;
    }

    let regionIds: number[] = [];
    let districtIds: number[] = [];
    let geographyLabel = "";

    if (role === "REGIONAL_ADMIN") {
      const names = splitNames(row["App regions"]);
      if (names.length === 0) {
        skipped.push({ personId, name, reason: "no App regions listed" });
        continue;
      }
      const unresolved = names.filter((n) => !regionsByName.has(n));
      if (unresolved.length > 0) {
        skipped.push({
          personId,
          name,
          reason: `unknown region name(s): ${unresolved.join(", ")}`,
        });
        continue;
      }
      regionIds = [...new Set(names.map((n) => regionsByName.get(n)!.id))];
      geographyLabel = names.join("; ");
    } else {
      const names = splitNames(row["App districts"]);
      if (names.length === 0) {
        skipped.push({ personId, name, reason: "no App districts listed" });
        continue;
      }
      const resolved = names.map((n) => ({
        raw: n,
        ...resolveDistrict(n, null, districts, aliasMap),
      }));
      const unresolved = resolved.filter((r) => !r.district);
      if (unresolved.length > 0) {
        skipped.push({
          personId,
          name,
          reason: `unknown district name(s): ${unresolved
            .map((r) =>
              r.ambiguous ? `${r.raw} (ambiguous, matches more than one district)` : r.raw,
            )
            .join(", ")}`,
        });
        continue;
      }
      const matched = resolved.map((r) => r.district!);
      districtIds = [...new Set(matched.map((d) => d.id))];
      // Mirrors resolveGeographicScope in user.routes.ts: a district admin's regionIds is always
      // derived from their own districts, never independently set.
      regionIds = [...new Set(matched.map((d) => d.regionId))];
      geographyLabel = names.join("; ");
    }

    seenPhones.set(normalizedPhone, personId);
    candidates.push({
      personId,
      fullName: name,
      level: cellText(row["GNAT title"]) || role,
      role,
      phone: normalizedPhone,
      regionIds,
      districtIds,
      geographyLabel,
    });
  }

  // Idempotent re-run: a phone already on an existing account is skipped, not re-created.
  const existing = candidates.length
    ? await prisma.user.findMany({
        where: { phone: { in: candidates.map((c) => c.phone) } },
        select: { phone: true },
      })
    : [];
  const existingPhones = new Set(existing.map((u) => u.phone));
  const toCreate = candidates.filter((c) => !existingPhones.has(c.phone));
  for (const c of candidates) {
    if (existingPhones.has(c.phone)) {
      skipped.push({
        personId: c.personId,
        name: c.fullName,
        reason: "an account with this phone already exists",
      });
    }
  }

  console.log(`${toCreate.length} account(s) will be created.`);
  console.log(`${skipped.length} row(s) will be skipped:\n`);
  for (const s of skipped) console.log(`  ${s.personId}  ${s.name || "(no name)"} -- ${s.reason}`);

  if (toCreate.length === 0) {
    console.log("\nNothing to create.");
    return;
  }

  console.log(`\nSample of accounts to create (first 10 of ${toCreate.length}):`);
  for (const c of toCreate.slice(0, 10)) {
    console.log(`  ${c.personId}  ${c.fullName}  ${c.role}  ${c.phone}  [${c.geographyLabel}]`);
  }

  const proceed = await confirm({
    message: `Create ${toCreate.length} staff admin account(s) now? Each gets a generated temp password; a credentials file will be written to ${OUTPUT_DIR}.`,
    default: false,
  });
  if (!proceed) {
    console.log("No changes made.");
    return;
  }

  const actorEmail = (await input({ message: "Your admin email (recorded in the audit log):" }))
    .trim()
    .toLowerCase();
  const actor = await prisma.user.findUnique({ where: { email: actorEmail } });
  if (!actor || !actor.isActive || !["SUPER_ADMIN", "NATIONAL_ADMIN"].includes(actor.role)) {
    throw new Error("An active SUPER_ADMIN or NATIONAL_ADMIN with that email was not found");
  }

  type Created = Candidate & { tempPassword: string };
  const created: Created[] = [];
  const failed: Skip[] = [];

  for (const c of toCreate) {
    const tempPassword = generateTempPassword();
    try {
      const passwordHash = await argon2.hash(tempPassword, {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      });
      const user = await prisma.user.create({
        data: {
          fullName: c.fullName,
          phone: c.phone,
          email: null,
          setupRequired: true,
          tempPasswordExpiresAt: tempPasswordExpiryInstant(),
          passwordHash,
          role: c.role,
          regionIds: c.regionIds,
          districtIds: c.districtIds,
          legacyRegionId: c.regionIds.length === 1 ? c.regionIds[0] : null,
          legacyDistrictId: c.districtIds.length === 1 ? c.districtIds[0] : null,
        },
        select: { id: true },
      });
      await recordAudit({
        request: { ip: null, userAgent: "bulk-create-staff-admins script" },
        actor: {
          id: actor.id,
          email: actor.email,
          regionIds: actor.regionIds,
          districtIds: actor.districtIds,
        },
        action: "USER_CREATED",
        entityType: "USER",
        entityId: user.id,
        description: `Bulk-created staff account for ${c.fullName} (${c.personId})`,
        afterData: {
          fullName: c.fullName,
          phone: c.phone,
          role: c.role,
          regionIds: c.regionIds,
          districtIds: c.districtIds,
        },
        regionId: c.regionIds.length === 1 ? c.regionIds[0] : null,
        districtId: c.districtIds.length === 1 ? c.districtIds[0] : null,
      });
      created.push({ ...c, tempPassword });
      console.log(`  created  ${c.personId}  ${c.fullName}`);
    } catch (error) {
      const field = uniqueViolationField(error);
      const reason = field
        ? `${field} is already in use (race)`
        : "unexpected error creating this account";
      failed.push({ personId: c.personId, name: c.fullName, reason });
      console.log(`  FAILED   ${c.personId}  ${c.fullName} -- ${reason}`);
    }
  }

  console.log(`\n${created.length} account(s) created, ${failed.length} failed.`);

  if (created.length > 0) {
    const outputPath = path.join(
      OUTPUT_DIR,
      `GNAT_admin_credentials_${new Date().toISOString().replace(/[:.]/g, "-")}.xlsx`,
    );
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Credentials");
    const headers = [
      "Person ID",
      "Name",
      "Level",
      "App role",
      "Phone",
      "Temporary password",
      "Region(s)/District(s)",
    ];
    sheet.addRow(headers);
    const dataRows = created.map((c) => [
      c.personId,
      c.fullName,
      c.level,
      c.role,
      c.phone,
      c.tempPassword,
      c.geographyLabel,
    ]);
    for (const row of dataRows) sheet.addRow(row);
    headers.forEach((header, index) => {
      const width = Math.max(
        header.length,
        ...dataRows.map((row) => String(row[index] ?? "").length),
      );
      sheet.getColumn(index + 1).width = Math.min(width + 2, 60);
    });
    await workbook.xlsx.writeFile(outputPath);
    console.log(`\nCredentials written to: ${outputPath}`);
    console.log(
      "This file contains live temporary passwords -- distribute it securely and delete it once done.",
    );
  }

  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  ${f.personId}  ${f.name} -- ${f.reason}`);
  }
}

main()
  .catch((error) => {
    if (error instanceof Error && error.name === "ExitPromptError") {
      console.log("\nCancelled. No changes made.");
      return;
    }
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
