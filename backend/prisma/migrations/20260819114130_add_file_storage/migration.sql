-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('MEMBER_DOCUMENT', 'MARRIAGE_CERTIFICATE', 'OTHER');

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" SERIAL NOT NULL,
    "category" "FileCategory" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "downloadPath" TEXT NOT NULL,
    "memberId" INTEGER NOT NULL,
    "spouseId" INTEGER,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_storedName_key" ON "StoredFile"("storedName");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_storagePath_key" ON "StoredFile"("storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_downloadPath_key" ON "StoredFile"("downloadPath");

-- CreateIndex
CREATE INDEX "StoredFile_memberId_idx" ON "StoredFile"("memberId");

-- CreateIndex
CREATE INDEX "StoredFile_spouseId_idx" ON "StoredFile"("spouseId");

-- CreateIndex
CREATE INDEX "StoredFile_uploadedById_idx" ON "StoredFile"("uploadedById");

-- CreateIndex
CREATE INDEX "StoredFile_category_idx" ON "StoredFile"("category");

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_spouseId_fkey" FOREIGN KEY ("spouseId") REFERENCES "Spouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
