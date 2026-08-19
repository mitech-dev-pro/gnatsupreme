-- CreateEnum
CREATE TYPE "BulkImportRowStatus" AS ENUM ('READY', 'INVALID', 'DUPLICATE', 'EXISTING', 'OUT_OF_SCOPE', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "MemberWorkflowAction" AS ENUM ('APPROVED', 'RETURNED', 'REMOVED');

-- CreateEnum
CREATE TYPE "RemovalReason" AS ENUM ('DEATH', 'DISABILITY', 'RETIREMENT', 'RESIGNATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ChangeRequestType" AS ENUM ('MEMBER_DETAILS', 'SPOUSE', 'BENEFICIARY_ADD', 'BENEFICIARY_UPDATE', 'BENEFICIARY_REMOVE');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'RETURNED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "importedRows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "readyRows" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MemberBulkImportRow" (
    "id" SERIAL NOT NULL,
    "importJobId" INTEGER NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "controllerId" TEXT,
    "fullName" TEXT,
    "school" TEXT,
    "districtName" TEXT,
    "districtId" INTEGER,
    "dateOfBirth" DATE,
    "ghanaCardId" TEXT,
    "phone" TEXT,
    "report20Matched" BOOLEAN NOT NULL DEFAULT false,
    "status" "BulkImportRowStatus" NOT NULL,
    "memberId" INTEGER,
    "issues" JSONB,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberBulkImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberWorkflowEvent" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "action" "MemberWorkflowAction" NOT NULL,
    "fromStatus" "MemberStatus" NOT NULL,
    "toStatus" "MemberStatus" NOT NULL,
    "reason" "RemovalReason",
    "note" TEXT,
    "performedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberWorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberChangeRequest" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "type" "ChangeRequestType" NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "targetBeneficiaryId" INTEGER,
    "proposedData" JSONB,
    "requestNote" TEXT,
    "requestedById" INTEGER,
    "reviewedById" INTEGER,
    "reviewNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberBulkImportRow_importJobId_status_idx" ON "MemberBulkImportRow"("importJobId", "status");

-- CreateIndex
CREATE INDEX "MemberBulkImportRow_controllerId_idx" ON "MemberBulkImportRow"("controllerId");

-- CreateIndex
CREATE INDEX "MemberBulkImportRow_memberId_idx" ON "MemberBulkImportRow"("memberId");

-- CreateIndex
CREATE INDEX "MemberBulkImportRow_districtId_idx" ON "MemberBulkImportRow"("districtId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberBulkImportRow_importJobId_rowNumber_key" ON "MemberBulkImportRow"("importJobId", "rowNumber");

-- CreateIndex
CREATE INDEX "MemberWorkflowEvent_memberId_createdAt_idx" ON "MemberWorkflowEvent"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberWorkflowEvent_action_idx" ON "MemberWorkflowEvent"("action");

-- CreateIndex
CREATE INDEX "MemberWorkflowEvent_performedById_idx" ON "MemberWorkflowEvent"("performedById");

-- CreateIndex
CREATE INDEX "MemberChangeRequest_memberId_status_idx" ON "MemberChangeRequest"("memberId", "status");

-- CreateIndex
CREATE INDEX "MemberChangeRequest_requestedById_idx" ON "MemberChangeRequest"("requestedById");

-- CreateIndex
CREATE INDEX "MemberChangeRequest_reviewedById_idx" ON "MemberChangeRequest"("reviewedById");

-- CreateIndex
CREATE INDEX "MemberChangeRequest_requestedAt_idx" ON "MemberChangeRequest"("requestedAt");

-- AddForeignKey
ALTER TABLE "MemberBulkImportRow" ADD CONSTRAINT "MemberBulkImportRow_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberBulkImportRow" ADD CONSTRAINT "MemberBulkImportRow_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberWorkflowEvent" ADD CONSTRAINT "MemberWorkflowEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberWorkflowEvent" ADD CONSTRAINT "MemberWorkflowEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberChangeRequest" ADD CONSTRAINT "MemberChangeRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberChangeRequest" ADD CONSTRAINT "MemberChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberChangeRequest" ADD CONSTRAINT "MemberChangeRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
