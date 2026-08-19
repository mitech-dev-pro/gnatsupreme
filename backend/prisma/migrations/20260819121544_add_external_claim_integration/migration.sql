-- CreateEnum
CREATE TYPE "ExternalClaimStatus" AS ENUM ('PENDING', 'REDIRECT_READY', 'SUBMITTED', 'FAILED', 'SYNCHRONIZED');

-- CreateTable
CREATE TABLE "ExternalClaimSubmission" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "submittedById" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MANKRADO',
    "idempotencyKey" TEXT NOT NULL,
    "externalClaimId" TEXT,
    "formUrl" TEXT,
    "status" "ExternalClaimStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "submittedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalClaimSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalClaimSubmission_idempotencyKey_key" ON "ExternalClaimSubmission"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalClaimSubmission_externalClaimId_key" ON "ExternalClaimSubmission"("externalClaimId");

-- CreateIndex
CREATE INDEX "ExternalClaimSubmission_memberId_idx" ON "ExternalClaimSubmission"("memberId");

-- CreateIndex
CREATE INDEX "ExternalClaimSubmission_submittedById_idx" ON "ExternalClaimSubmission"("submittedById");

-- CreateIndex
CREATE INDEX "ExternalClaimSubmission_status_idx" ON "ExternalClaimSubmission"("status");

-- CreateIndex
CREATE INDEX "ExternalClaimSubmission_createdAt_idx" ON "ExternalClaimSubmission"("createdAt");

-- AddForeignKey
ALTER TABLE "ExternalClaimSubmission" ADD CONSTRAINT "ExternalClaimSubmission_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalClaimSubmission" ADD CONSTRAINT "ExternalClaimSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
