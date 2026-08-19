-- CreateEnum
CREATE TYPE "BenefitType" AS ENUM ('DEATH', 'TOTAL_PERMANENT_DISABILITY', 'CRITICAL_ILLNESS', 'HOSPITALIZATION');

-- CreateTable
CREATE TABLE "BenefitPlanVersion" (
    "id" SERIAL NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "monthlyPremium" DECIMAL(12,2) NOT NULL,
    "collectionMethod" TEXT NOT NULL,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenefitPlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitAmount" (
    "id" SERIAL NOT NULL,
    "planVersionId" INTEGER NOT NULL,
    "type" "BenefitType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "memberAmount" DECIMAL(14,2) NOT NULL,
    "spouseAmount" DECIMAL(14,2),

    CONSTRAINT "BenefitAmount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BenefitPlanVersion_effectiveFrom_key" ON "BenefitPlanVersion"("effectiveFrom");

-- CreateIndex
CREATE INDEX "BenefitPlanVersion_effectiveFrom_idx" ON "BenefitPlanVersion"("effectiveFrom");

-- CreateIndex
CREATE INDEX "BenefitPlanVersion_createdById_idx" ON "BenefitPlanVersion"("createdById");

-- CreateIndex
CREATE INDEX "BenefitAmount_type_idx" ON "BenefitAmount"("type");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitAmount_planVersionId_type_key" ON "BenefitAmount"("planVersionId", "type");

-- AddForeignKey
ALTER TABLE "BenefitPlanVersion" ADD CONSTRAINT "BenefitPlanVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitAmount" ADD CONSTRAINT "BenefitAmount_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "BenefitPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
