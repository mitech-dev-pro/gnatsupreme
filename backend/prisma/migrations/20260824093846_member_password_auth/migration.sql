-- Add member email + password fields
ALTER TABLE "members" ADD COLUMN "email" TEXT;
ALTER TABLE "members" ADD COLUMN "password_hash" TEXT;
CREATE UNIQUE INDEX "members_email_key" ON "members"("email");

-- Drop the OTP-based member auth table (full replacement by password auth)
DROP TABLE "member_otp_challenges";

-- New table for self-service password reset (email-based only)
CREATE TABLE "member_password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "member_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "member_password_reset_tokens_token_hash_key" ON "member_password_reset_tokens"("token_hash");
CREATE INDEX "member_password_reset_tokens_member_id_created_at_idx" ON "member_password_reset_tokens"("member_id", "created_at");
CREATE INDEX "member_password_reset_tokens_expires_at_idx" ON "member_password_reset_tokens"("expires_at");

ALTER TABLE "member_password_reset_tokens" ADD CONSTRAINT "member_password_reset_tokens_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
