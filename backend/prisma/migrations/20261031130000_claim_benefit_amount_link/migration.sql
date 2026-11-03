-- AlterTable
ALTER TABLE "external_claim_submissions" ADD COLUMN "benefit_amount_id" INTEGER;

-- CreateIndex
CREATE INDEX "external_claim_submissions_benefit_amount_id_idx" ON "external_claim_submissions"("benefit_amount_id");

-- AddForeignKey
ALTER TABLE "external_claim_submissions" ADD CONSTRAINT "external_claim_submissions_benefit_amount_id_fkey" FOREIGN KEY ("benefit_amount_id") REFERENCES "benefit_amounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
