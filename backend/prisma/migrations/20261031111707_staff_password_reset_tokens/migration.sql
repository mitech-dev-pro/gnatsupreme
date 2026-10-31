-- CreateTable
CREATE TABLE "user_password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_password_reset_tokens_token_hash_key" ON "user_password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "user_password_reset_tokens_user_id_created_at_idx" ON "user_password_reset_tokens"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "user_password_reset_tokens_expires_at_idx" ON "user_password_reset_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "user_password_reset_tokens" ADD CONSTRAINT "user_password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
