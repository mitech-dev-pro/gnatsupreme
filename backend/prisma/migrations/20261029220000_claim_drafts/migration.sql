CREATE TABLE "claim_drafts" (
  "id" SERIAL NOT NULL,
  "member_id" INTEGER NOT NULL,
  "prepared_by_id" INTEGER,
  "prepared_by_member_id" INTEGER,
  "submission_key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "document_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "revision" INTEGER NOT NULL DEFAULT 1,
  "submitted_claim_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "claim_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "claim_drafts_one_preparer" CHECK (num_nonnulls("prepared_by_id", "prepared_by_member_id") = 1),
  CONSTRAINT "claim_drafts_member_ownership" CHECK ("prepared_by_member_id" IS NULL OR "prepared_by_member_id" = "member_id"),
  CONSTRAINT "claim_drafts_revision_positive" CHECK ("revision" > 0),
  CONSTRAINT "claim_drafts_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "claim_drafts_prepared_by_id_fkey" FOREIGN KEY ("prepared_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "claim_drafts_prepared_by_member_id_fkey" FOREIGN KEY ("prepared_by_member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "claim_drafts_submitted_claim_id_fkey" FOREIGN KEY ("submitted_claim_id") REFERENCES "external_claim_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "claim_drafts_submission_key_key" ON "claim_drafts"("submission_key");
CREATE UNIQUE INDEX "claim_drafts_submitted_claim_id_key" ON "claim_drafts"("submitted_claim_id");
CREATE INDEX "claim_drafts_prepared_by_id_updated_at_id_idx" ON "claim_drafts"("prepared_by_id", "updated_at" DESC, "id" DESC);
CREATE INDEX "claim_drafts_prepared_by_member_id_updated_at_id_idx" ON "claim_drafts"("prepared_by_member_id", "updated_at" DESC, "id" DESC);
CREATE INDEX "claim_drafts_member_id_idx" ON "claim_drafts"("member_id");
CREATE INDEX "claim_drafts_document_ids_idx" ON "claim_drafts" USING GIN ("document_ids");
