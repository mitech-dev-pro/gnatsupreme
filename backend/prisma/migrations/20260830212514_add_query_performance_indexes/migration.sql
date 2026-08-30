-- Search endpoints use case-insensitive substring matching. PostgreSQL's regular
-- B-tree indexes cannot serve ILIKE '%term%', so enable trigram operator indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Member ledger, dashboard counts, school filters, and recent-member queries.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "members_status_updated_at_idx"
  ON "members" ("status", "updated_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "members_district_id_status_updated_at_idx"
  ON "members" ("district_id", "status", "updated_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "members_district_id_school_idx"
  ON "members" ("district_id", "school");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "members_district_id_created_at_idx"
  ON "members" ("district_id", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "members_district_id_report20_matched_idx"
  ON "members" ("district_id", "report20_matched");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "members_missing_report20_idx"
  ON "members" ("district_id", "missing_from_report20_at")
  WHERE "missing_from_report20_at" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "members_full_name_trgm_idx"
  ON "members" USING GIN ("full_name" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "members_controller_id_trgm_idx"
  ON "members" USING GIN ("controller_id" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "members_ghana_card_id_trgm_idx"
  ON "members" USING GIN ("ghana_card_id" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "members_school_trgm_idx"
  ON "members" USING GIN ("school" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "members_controller_id_lower_idx"
  ON "members" (LOWER("controller_id"));

-- Staff management list and case-insensitive email checks.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_full_name_id_idx"
  ON "users" ("full_name", "id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_role_is_active_full_name_id_idx"
  ON "users" ("role", "is_active", "full_name", "id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_full_name_trgm_idx"
  ON "users" USING GIN ("full_name" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_email_trgm_idx"
  ON "users" USING GIN ("email" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_email_lower_idx"
  ON "users" (LOWER("email"));

-- Audit ledger search, scope, date filtering, and stable newest-first paging.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_created_at_id_idx"
  ON "audit_logs" ("created_at" DESC, "id" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_region_id_created_at_id_idx"
  ON "audit_logs" ("region_id", "created_at" DESC, "id" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_district_id_created_at_id_idx"
  ON "audit_logs" ("district_id", "created_at" DESC, "id" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_description_trgm_idx"
  ON "audit_logs" USING GIN ("description" gin_trgm_ops);

-- Transfer, claim, and change-request work queues.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "member_transfers_status_requested_at_id_idx"
  ON "member_transfers" ("status", "requested_at" DESC, "id" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "member_transfers_from_district_id_status_requested_at_id_idx"
  ON "member_transfers" ("from_district_id", "status", "requested_at" DESC, "id" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "member_transfers_to_district_id_status_requested_at_id_idx"
  ON "member_transfers" ("to_district_id", "status", "requested_at" DESC, "id" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "external_claim_submissions_status_created_at_id_idx"
  ON "external_claim_submissions" ("status", "created_at" DESC, "id" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "external_claim_submissions_member_id_created_at_id_idx"
  ON "external_claim_submissions" ("member_id", "created_at" DESC, "id" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "member_change_requests_status_requested_at_id_idx"
  ON "member_change_requests" ("status", "requested_at" DESC, "id" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "member_change_requests_member_id_type_target_beneficiary_id_idx"
  ON "member_change_requests" ("member_id", "type", "target_beneficiary_id", "status");

-- Import job histories and high-volume row review screens.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "import_jobs_type_created_at_idx"
  ON "import_jobs" ("type", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "import_jobs_type_status_created_at_idx"
  ON "import_jobs" ("type", "status", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "import_jobs_uploaded_by_id_type_created_at_idx"
  ON "import_jobs" ("uploaded_by_id", "type", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "import_jobs_uploaded_by_id_type_status_created_at_idx"
  ON "import_jobs" ("uploaded_by_id", "type", "status", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "report20_rows_import_job_id_status_row_number_idx"
  ON "report20_rows" ("import_job_id", "status", "row_number");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "member_bulk_import_rows_import_job_id_status_row_number_idx"
  ON "member_bulk_import_rows" ("import_job_id", "status", "row_number");

-- Notification feeds and workflow-event dashboard counts.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notifications_user_id_channel_created_at_idx"
  ON "notifications" ("user_id", "channel", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notifications_member_id_channel_created_at_idx"
  ON "notifications" ("member_id", "channel", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "member_workflow_events_to_status_created_at_idx"
  ON "member_workflow_events" ("to_status", "created_at");

-- Case-insensitive exact geography lookups used by setup and import validation.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "regions_name_lower_idx"
  ON "regions" (LOWER("name"));
CREATE INDEX CONCURRENTLY IF NOT EXISTS "districts_region_id_name_lower_idx"
  ON "districts" ("region_id", LOWER("name"));
CREATE INDEX CONCURRENTLY IF NOT EXISTS "district_aliases_alias_lower_idx"
  ON "district_aliases" (LOWER("alias"));
