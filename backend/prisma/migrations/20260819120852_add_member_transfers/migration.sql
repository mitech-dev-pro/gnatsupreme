-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "MemberTransfer" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "fromDistrictId" INTEGER NOT NULL,
    "toDistrictId" INTEGER NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "reviewedById" INTEGER,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "activeKey" TEXT,
    "reason" TEXT NOT NULL,
    "reviewNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberTransfer_activeKey_key" ON "MemberTransfer"("activeKey");

-- CreateIndex
CREATE INDEX "MemberTransfer_memberId_idx" ON "MemberTransfer"("memberId");

-- CreateIndex
CREATE INDEX "MemberTransfer_fromDistrictId_idx" ON "MemberTransfer"("fromDistrictId");

-- CreateIndex
CREATE INDEX "MemberTransfer_toDistrictId_idx" ON "MemberTransfer"("toDistrictId");

-- CreateIndex
CREATE INDEX "MemberTransfer_status_idx" ON "MemberTransfer"("status");

-- CreateIndex
CREATE INDEX "MemberTransfer_requestedAt_idx" ON "MemberTransfer"("requestedAt");

-- AddForeignKey
ALTER TABLE "MemberTransfer" ADD CONSTRAINT "MemberTransfer_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTransfer" ADD CONSTRAINT "MemberTransfer_fromDistrictId_fkey" FOREIGN KEY ("fromDistrictId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTransfer" ADD CONSTRAINT "MemberTransfer_toDistrictId_fkey" FOREIGN KEY ("toDistrictId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTransfer" ADD CONSTRAINT "MemberTransfer_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTransfer" ADD CONSTRAINT "MemberTransfer_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
