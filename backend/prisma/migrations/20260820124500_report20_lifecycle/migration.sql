-- Add ENROLLED to import_row_status (auto-enrolled-from-Report20 rows)
ALTER TYPE "import_row_status" ADD VALUE IF NOT EXISTS 'ENROLLED';

-- Track members that were not found in the most recently reconciled Report 20 file
ALTER TABLE "members" ADD COLUMN "missing_from_report20_at" TIMESTAMP(3);

-- Job-level counters for the new Report 20 lifecycle behavior
ALTER TABLE "import_jobs" ADD COLUMN "enrolled_rows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "import_jobs" ADD COLUMN "flagged_for_removal_rows" INTEGER NOT NULL DEFAULT 0;
