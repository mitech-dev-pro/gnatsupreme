ALTER TABLE "import_jobs" DROP CONSTRAINT "import_jobs_credentials_file_id_fkey";
DROP INDEX "import_jobs_credentials_file_id_key";
ALTER TABLE "import_jobs" DROP COLUMN "credentials_file_id";
