-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('REPORT_20', 'MEMBER_BULK');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('MATCHED', 'CHANGED', 'UNMATCHED', 'DUPLICATE', 'INVALID');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FileCategory" ADD VALUE 'REPORT_20';
ALTER TYPE "FileCategory" ADD VALUE 'MEMBER_IMPORT';

-- AlterTable
ALTER TABLE "StoredFile" ALTER COLUMN "memberId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" SERIAL NOT NULL,
    "type" "ImportType" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "checksum" TEXT NOT NULL,
    "fileId" INTEGER NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "reportMonth" DATE,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "matchedRows" INTEGER NOT NULL DEFAULT 0,
    "changedRows" INTEGER NOT NULL DEFAULT 0,
    "unmatchedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report20Row" (
    "id" SERIAL NOT NULL,
    "importJobId" INTEGER NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "controllerId" TEXT,
    "fullName" TEXT,
    "districtName" TEXT,
    "school" TEXT,
    "ghanaCardId" TEXT,
    "status" "ImportRowStatus" NOT NULL,
    "memberId" INTEGER,
    "issues" JSONB,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report20Row_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_fileId_key" ON "ImportJob"("fileId");

-- CreateIndex
CREATE INDEX "ImportJob_status_idx" ON "ImportJob"("status");

-- CreateIndex
CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_type_checksum_key" ON "ImportJob"("type", "checksum");

-- CreateIndex
CREATE INDEX "Report20Row_importJobId_status_idx" ON "Report20Row"("importJobId", "status");

-- CreateIndex
CREATE INDEX "Report20Row_controllerId_idx" ON "Report20Row"("controllerId");

-- CreateIndex
CREATE INDEX "Report20Row_memberId_idx" ON "Report20Row"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Report20Row_importJobId_rowNumber_key" ON "Report20Row"("importJobId", "rowNumber");

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report20Row" ADD CONSTRAINT "Report20Row_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report20Row" ADD CONSTRAINT "Report20Row_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
