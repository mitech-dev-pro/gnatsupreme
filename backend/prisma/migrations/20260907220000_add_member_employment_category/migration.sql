-- Distinguishes teachers on the government payroll (Report 20 applies to them) from
-- administrative/back-office staff who are members of the scheme but never appear in a Report
-- 20 file. Default TEACHING preserves current behavior for every existing row -- Report 20
-- reconciliation (reconcileReport20) excludes NON_TEACHING members from its missing/reappeared
-- sweep entirely so their status stays fully staff-managed. See report20.service.ts.

-- CreateEnum
CREATE TYPE "member_employment_category" AS ENUM ('TEACHING', 'NON_TEACHING');

-- AlterTable
ALTER TABLE "members" ADD COLUMN "employment_category" "member_employment_category" NOT NULL DEFAULT 'TEACHING';

-- CreateIndex
-- Matches reconcileReport20's activeMembers query, which filters status IN (...) alongside
-- employmentCategory: "TEACHING" on every Report 20 upload.
CREATE INDEX "members_status_employment_category_idx" ON "members"("status", "employment_category");
