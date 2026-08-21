-- Tracks live progress for large background imports (Report 20 reconciliation, member bulk import)
ALTER TABLE "import_jobs" ADD COLUMN "processed_rows" INTEGER NOT NULL DEFAULT 0;
