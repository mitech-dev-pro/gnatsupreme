-- CreateTable
CREATE TABLE "OrganizationSettings" (
    "id" SERIAL NOT NULL,
    "singletonKey" TEXT NOT NULL DEFAULT 'MILIFE',
    "portalName" TEXT NOT NULL DEFAULT 'GNAT Supreme Care',
    "schemeSponsor" TEXT NOT NULL DEFAULT 'GNAT',
    "underwriter" TEXT NOT NULL DEFAULT 'miLife Insurance',
    "sidebarMark" TEXT NOT NULL DEFAULT 'GS',
    "primaryColor" TEXT NOT NULL DEFAULT '#102A43',
    "accentColor" TEXT NOT NULL DEFAULT '#00A896',
    "memberIdLabel" TEXT NOT NULL DEFAULT 'Controller ID',
    "reconciliationSource" TEXT NOT NULL DEFAULT 'CAGD Report 20',
    "subRegionLabel" TEXT NOT NULL DEFAULT 'District',
    "organizationEmail" TEXT,
    "organizationPhone" TEXT,
    "address" TEXT,
    "websiteUrl" TEXT,
    "privacyNotice" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Accra',
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationSettingsVersion" (
    "id" SERIAL NOT NULL,
    "settingsId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedFields" JSONB NOT NULL,
    "changedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationSettingsVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSettings_singletonKey_key" ON "OrganizationSettings"("singletonKey");

-- CreateIndex
CREATE INDEX "OrganizationSettings_updatedById_idx" ON "OrganizationSettings"("updatedById");

-- CreateIndex
CREATE INDEX "OrganizationSettingsVersion_changedById_idx" ON "OrganizationSettingsVersion"("changedById");

-- CreateIndex
CREATE INDEX "OrganizationSettingsVersion_createdAt_idx" ON "OrganizationSettingsVersion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSettingsVersion_settingsId_version_key" ON "OrganizationSettingsVersion"("settingsId", "version");

-- AddForeignKey
ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationSettingsVersion" ADD CONSTRAINT "OrganizationSettingsVersion_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "OrganizationSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationSettingsVersion" ADD CONSTRAINT "OrganizationSettingsVersion_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
