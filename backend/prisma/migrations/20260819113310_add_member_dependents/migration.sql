-- CreateEnum
CREATE TYPE "BeneficiaryRelationship" AS ENUM ('CHILD', 'SPOUSE', 'PARENT', 'SIBLING', 'OTHER');

-- CreateTable
CREATE TABLE "Spouse" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "ghanaCardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Spouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beneficiary" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" "BeneficiaryRelationship" NOT NULL,
    "dateOfBirth" DATE,
    "trusteeName" TEXT,
    "trusteeGhanaCardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Spouse_memberId_key" ON "Spouse"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Spouse_ghanaCardId_key" ON "Spouse"("ghanaCardId");

-- CreateIndex
CREATE INDEX "Beneficiary_memberId_idx" ON "Beneficiary"("memberId");

-- AddForeignKey
ALTER TABLE "Spouse" ADD CONSTRAINT "Spouse_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
