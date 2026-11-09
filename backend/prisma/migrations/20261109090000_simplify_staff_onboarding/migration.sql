-- Simplifies staff phone-login onboarding: drops the email-confirmation subsystem (pending
-- email + its verification tokens) entirely, and adds the two columns the new hard-lockout +
-- "first login since setup was armed" admin visibility need.

ALTER TABLE "users" DROP COLUMN "pending_email";
ALTER TABLE "users" DROP COLUMN "pending_email_expires_at";
ALTER TABLE "users" ADD COLUMN "setup_armed_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "setup_failed_attempts" INTEGER NOT NULL DEFAULT 0;

DROP TABLE "user_email_verification_tokens";

CREATE INDEX "audit_logs_action_entity_id_created_at_idx" ON "audit_logs"("action", "entity_id", "created_at");
