-- Multi-region / multi-district staff admin accounts.
-- Adds array-based scope columns to "users". The existing singular region_id/district_id
-- columns are untouched -- Prisma's schema now calls them legacyRegionId/legacyDistrictId via
-- @map, which generates no DDL on its own (confirmed via `prisma migrate diff` before writing
-- this migration by hand, since the shadow database isn't available to this DB user).
ALTER TABLE "users" ADD COLUMN "region_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "users" ADD COLUMN "district_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- Backfill from the legacy singular columns. Guarded by "region_ids" = '{}' / "district_ids" =
-- '{}' so this is safe to re-run (e.g. a post-deploy reconciliation pass under a rolling deploy).
UPDATE "users" SET "region_ids" = ARRAY["region_id"]
WHERE "region_ids" = '{}' AND "region_id" IS NOT NULL;

UPDATE "users" SET "district_ids" = ARRAY["district_id"]
WHERE "district_ids" = '{}' AND "district_id" IS NOT NULL;

-- New row statuses for a bulk-import row that's ambiguous within a multi-scope importer's own
-- districts/regions (not OUT_OF_SCOPE -- the row isn't outside the importer's scope, it's just
-- unclear which of their own districts/regions it belongs to). Safe to run in the same
-- transaction as the column changes above on Postgres 12+ (confirmed running Postgres 18 here)
-- since nothing in this migration uses the new values yet.
ALTER TYPE "bulk_import_row_status" ADD VALUE 'AMBIGUOUS_DISTRICT';
ALTER TYPE "bulk_import_row_status" ADD VALUE 'AMBIGUOUS_REGION';
