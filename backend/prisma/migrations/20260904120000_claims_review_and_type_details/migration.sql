-- Adds member-portal claim submission support: a review workflow for member-filed claims,
-- type-specific claim detail storage, and a dedicated CLAIM_DOCUMENT file category.
--
-- NOTE on reusing ExternalClaimStatus.PENDING: this status is repurposed to also mean
-- "awaiting staff review" for a member-submitted claim (source = MEMBER_PORTAL). Two other
-- things already touch PENDING and must stay disjoint from that meaning by `source`, not by
-- status alone:
--   1. The real Mankrado provider integration is a stub that always throws (see
--      claims/mankrado.provider.ts) -- no live path uses PENDING/REDIRECT_READY as "awaiting
--      provider sync" today.
--   2. workflows/workflow.routes.ts's POST /:id/remove creates a claim stub with
--      status: PENDING (source defaults to STAFF) when removing a member for DEATH/DISABILITY
--      -- a pre-existing, unrelated use. The staff review queue filters on
--      source: MEMBER_PORTAL AND status: PENDING, so this STAFF-sourced row is correctly
--      excluded, but any future code that creates a claim must set `source` deliberately
--      rather than relying on the STAFF default to stay out of the review queue.
-- Re-check this invariant before reusing PENDING for anything else.

-- CreateEnum
CREATE TYPE "claim_submission_source" AS ENUM ('STAFF', 'MEMBER_PORTAL');

-- AlterEnum
ALTER TYPE "external_claim_status" ADD VALUE 'RETURNED';

-- AlterEnum
ALTER TYPE "file_category" ADD VALUE 'CLAIM_DOCUMENT';

-- AlterTable
ALTER TABLE "external_claim_submissions"
  ADD COLUMN "claim_details" JSONB,
  ADD COLUMN "review_note" TEXT,
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_by_id" INTEGER,
  ADD COLUMN "source" "claim_submission_source" NOT NULL DEFAULT 'STAFF',
  ADD COLUMN "submitted_by_member_id" INTEGER,
  ALTER COLUMN "submitted_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "stored_files" ADD COLUMN "slot_key" TEXT;

-- CreateIndex
CREATE INDEX "external_claim_submissions_submitted_by_member_id_idx" ON "external_claim_submissions"("submitted_by_member_id");

-- CreateIndex
CREATE INDEX "external_claim_submissions_source_status_idx" ON "external_claim_submissions"("source", "status");

-- AddForeignKey
ALTER TABLE "external_claim_submissions" ADD CONSTRAINT "external_claim_submissions_submitted_by_member_id_fkey" FOREIGN KEY ("submitted_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_claim_submissions" ADD CONSTRAINT "external_claim_submissions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
