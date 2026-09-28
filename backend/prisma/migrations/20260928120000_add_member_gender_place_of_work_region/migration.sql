-- Adds non-teaching-staff support: a gender field, a free-text place-of-work field for members
-- with no real district, and a direct regionId so those district-less members stay visible to
-- REGIONAL_ADMIN scoping (member.access.ts), which filters on regionId rather than needing to
-- go through a district relation. regionId is kept in sync with district.regionId whenever a
-- district is set -- it's only ever independent for a district-less member.

-- CreateEnum
CREATE TYPE "member_gender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable: members
ALTER TABLE "members"
  ADD COLUMN "gender" "member_gender",
  ADD COLUMN "place_of_work" TEXT,
  ADD COLUMN "region_id" INTEGER;

-- AlterTable: member_bulk_import_rows
-- regionId/employmentCategory are resolved once at staging time and read back as-is at commit,
-- not re-derived -- see member-import.service.ts.
ALTER TABLE "member_bulk_import_rows"
  ADD COLUMN "region_id" INTEGER,
  ADD COLUMN "employment_category" "member_employment_category";

-- AlterTable: import_jobs
-- Persisted (not just passed through the upload request) so a /rerun, which resumes the commit
-- loop without re-uploading the file, still has access to the upload screen's selections.
ALTER TABLE "import_jobs"
  ADD COLUMN "default_employment_category" "member_employment_category",
  ADD COLUMN "default_region_id" INTEGER;

-- CreateIndex
CREATE INDEX "members_region_id_idx" ON "members"("region_id");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_bulk_import_rows" ADD CONSTRAINT "member_bulk_import_rows_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_default_region_id_fkey" FOREIGN KEY ("default_region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing member/staged row that already has a district gets its regionId
-- derived from that district right now. Without this, the flat regionId filter added to
-- resolveMemberScope for REGIONAL_ADMIN would make every existing member vanish from their view
-- the moment this ships (the new column starts out null for every row).
UPDATE "members"
SET "region_id" = (SELECT "region_id" FROM "districts" WHERE "districts"."id" = "members"."district_id")
WHERE "district_id" IS NOT NULL;

UPDATE "member_bulk_import_rows"
SET "region_id" = (SELECT "region_id" FROM "districts" WHERE "districts"."id" = "member_bulk_import_rows"."district_id")
WHERE "district_id" IS NOT NULL;
