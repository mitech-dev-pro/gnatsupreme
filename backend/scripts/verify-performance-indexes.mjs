import "dotenv/config";
import pg from "pg";

const expectedIndexes = [
  "members_status_updated_at_idx",
  "members_district_id_status_updated_at_idx",
  "members_district_id_school_idx",
  "members_district_id_created_at_idx",
  "members_district_id_report20_matched_idx",
  "members_missing_report20_idx",
  "members_full_name_trgm_idx",
  "members_controller_id_trgm_idx",
  "members_ghana_card_id_trgm_idx",
  "members_school_trgm_idx",
  "members_controller_id_lower_idx",
  "users_full_name_id_idx",
  "users_role_is_active_full_name_id_idx",
  "users_full_name_trgm_idx",
  "users_email_trgm_idx",
  "users_email_lower_idx",
  "audit_logs_created_at_id_idx",
  "audit_logs_region_id_created_at_id_idx",
  "audit_logs_district_id_created_at_id_idx",
  "audit_logs_description_trgm_idx",
  "member_transfers_status_requested_at_id_idx",
  "member_transfers_from_district_id_status_requested_at_id_idx",
  "member_transfers_to_district_id_status_requested_at_id_idx",
  "external_claim_submissions_status_created_at_id_idx",
  "external_claim_submissions_member_id_created_at_id_idx",
  "member_change_requests_status_requested_at_id_idx",
  "member_change_requests_member_id_type_target_beneficiary_id_idx",
  "import_jobs_type_created_at_idx",
  "import_jobs_type_status_created_at_idx",
  "import_jobs_uploaded_by_id_type_created_at_idx",
  "import_jobs_uploaded_by_id_type_status_created_at_idx",
  "report20_rows_import_job_id_status_row_number_idx",
  "member_bulk_import_rows_import_job_id_status_row_number_idx",
  "notifications_user_id_channel_created_at_idx",
  "notifications_member_id_channel_created_at_idx",
  "member_workflow_events_to_status_created_at_idx",
  "regions_name_lower_idx",
  "districts_region_id_name_lower_idx",
  "district_aliases_alias_lower_idx",
];

const representativePlans = [
  {
    name: "exact Staff ID lookup",
    expected: "Member_controllerId_key",
    sql: "SELECT id FROM members WHERE controller_id = '123456'",
  },
  {
    name: "member substring search",
    expected: "members_full_name_trgm_idx",
    sql: "SELECT id FROM members WHERE full_name ILIKE '%est%'",
  },
  {
    name: "district member ledger",
    expected: "members_district_id_status_updated_at_idx",
    sql: "SELECT id FROM members WHERE district_id = 1 ORDER BY status ASC, updated_at DESC LIMIT 25",
  },
  {
    name: "staff email search",
    expected: "users_email_trgm_idx",
    sql: "SELECT id FROM users WHERE email ILIKE '%example%'",
  },
  {
    name: "exact normalized staff email lookup",
    expected: "User_email_key",
    sql: "SELECT id FROM users WHERE email = 'person@example.com'",
  },
  {
    name: "audit description search",
    expected: "audit_logs_description_trgm_idx",
    sql: "SELECT id FROM audit_logs WHERE description ILIKE '%member%'",
  },
  {
    name: "Report 20 issue review",
    expected: "report20_rows_import_job_id_status_row_number_idx",
    sql: "SELECT id FROM report20_rows WHERE import_job_id = 1 AND status = 'INVALID' ORDER BY row_number ASC LIMIT 50",
  },
];

function collectIndexNames(node, names = new Set()) {
  if (!node || typeof node !== "object") return names;
  if (typeof node["Index Name"] === "string") names.add(node["Index Name"]);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((item) => collectIndexNames(item, names));
    else if (value && typeof value === "object") collectIndexNames(value, names);
  }
  return names;
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const extension = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'");
  const result = await client.query(
    `SELECT c.relname AS name, i.indisvalid AS valid, i.indisready AS ready
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname = ANY($1::text[])
      ORDER BY c.relname`,
    [expectedIndexes],
  );

  const found = new Map(result.rows.map((row) => [row.name, row]));
  const missing = expectedIndexes.filter((name) => !found.has(name));
  const invalid = result.rows.filter((row) => !row.valid || !row.ready).map((row) => row.name);

  console.log(`pg_trgm: ${extension.rowCount === 1 ? "installed" : "missing"}`);
  console.log(`Performance indexes: ${result.rowCount}/${expectedIndexes.length} present`);
  if (missing.length) console.error(`Missing: ${missing.join(", ")}`);
  if (invalid.length) console.error(`Invalid or incomplete: ${invalid.join(", ")}`);

  await client.query("SET enable_seqscan = off");
  const unusedByRepresentativePlan = [];
  for (const check of representativePlans) {
    const explained = await client.query(`EXPLAIN (FORMAT JSON) ${check.sql}`);
    const indexes = collectIndexNames(explained.rows[0]["QUERY PLAN"]);
    const passes = indexes.has(check.expected);
    console.log(`${check.name}: ${passes ? check.expected : `expected ${check.expected}, saw ${[...indexes].join(", ") || "no index"}`}`);
    if (!passes) unusedByRepresentativePlan.push(check.name);
  }

  if (extension.rowCount !== 1 || missing.length || invalid.length || unusedByRepresentativePlan.length) process.exitCode = 1;
} finally {
  await client.end();
}
