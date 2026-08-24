ALTER TABLE "stored_files" ALTER COLUMN "uploaded_by_id" DROP NOT NULL;
ALTER TABLE "stored_files" ADD COLUMN "uploaded_by_member_id" INTEGER;

CREATE INDEX "StoredFile_uploadedByMemberId_idx" ON "stored_files"("uploaded_by_member_id");

ALTER TABLE "stored_files" ADD CONSTRAINT "StoredFile_uploadedByMemberId_fkey" FOREIGN KEY ("uploaded_by_member_id") REFERENCES "members"("id") ON UPDATE CASCADE ON DELETE SET NULL;
