-- CreateTable
CREATE TABLE "MemberOtpChallenge" (
    "id" SERIAL NOT NULL,
    "publicToken" TEXT NOT NULL,
    "memberId" INTEGER NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "consumedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberSession" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "memberId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberOtpChallenge_publicToken_key" ON "MemberOtpChallenge"("publicToken");

-- CreateIndex
CREATE INDEX "MemberOtpChallenge_memberId_createdAt_idx" ON "MemberOtpChallenge"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberOtpChallenge_expiresAt_idx" ON "MemberOtpChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemberSession_tokenHash_key" ON "MemberSession"("tokenHash");

-- CreateIndex
CREATE INDEX "MemberSession_memberId_idx" ON "MemberSession"("memberId");

-- CreateIndex
CREATE INDEX "MemberSession_expiresAt_idx" ON "MemberSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "MemberOtpChallenge" ADD CONSTRAINT "MemberOtpChallenge_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSession" ADD CONSTRAINT "MemberSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
