-- Phone-based login + mandatory setup for staff accounts without a confirmed email.
-- Additive only -- email stays whatever it already was for every existing row; every new
-- column defaults to null/false, so no existing account's behavior changes.

ALTER TABLE "users" ADD COLUMN "pending_email" TEXT;
ALTER TABLE "users" ADD COLUMN "pending_email_expires_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
ALTER TABLE "users" ADD COLUMN "setup_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "temp_password_expires_at" TIMESTAMP(3);
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE UNIQUE INDEX "users_pending_email_key" ON "users"("pending_email");

-- CreateTable
CREATE TABLE "user_email_verification_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_email_verification_tokens_token_hash_key" ON "user_email_verification_tokens"("token_hash");
CREATE INDEX "user_email_verification_tokens_user_id_created_at_idx" ON "user_email_verification_tokens"("user_id", "created_at");
CREATE INDEX "user_email_verification_tokens_expires_at_idx" ON "user_email_verification_tokens"("expires_at");

ALTER TABLE "user_email_verification_tokens" ADD CONSTRAINT "user_email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
