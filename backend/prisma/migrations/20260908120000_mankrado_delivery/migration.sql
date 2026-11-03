CREATE TYPE "claim_delivery_state" AS ENUM ('NOT_SENT', 'SENDING', 'ACCEPTED', 'FAILED', 'UNKNOWN');
ALTER TABLE "external_claim_submissions"
  ADD COLUMN "delivery_state" "claim_delivery_state" NOT NULL DEFAULT 'NOT_SENT',
  ADD COLUMN "delivery_started_at" TIMESTAMP(3),
  ADD COLUMN "external_status" TEXT;
CREATE INDEX "external_claim_submissions_delivery_state_delivery_started_at_idx"
  ON "external_claim_submissions"("delivery_state", "delivery_started_at");
-- Existing simulated records retain their provider and cannot enter live delivery.
