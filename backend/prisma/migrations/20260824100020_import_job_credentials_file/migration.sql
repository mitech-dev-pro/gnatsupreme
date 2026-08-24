ALTER TYPE "file_category" ADD VALUE 'MEMBER_CREDENTIALS';

ALTER TABLE "import_jobs" ADD COLUMN "credentials_file_id" INTEGER;
CREATE UNIQUE INDEX "import_jobs_credentials_file_id_key" ON "import_jobs"("credentials_file_id");
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_credentials_file_id_fkey" FOREIGN KEY ("credentials_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
