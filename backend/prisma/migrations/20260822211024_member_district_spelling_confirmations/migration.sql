CREATE TABLE "member_district_spelling_confirmations" (
    "id" SERIAL NOT NULL,
    "member_id" INTEGER NOT NULL,
    "raw_spelling" TEXT NOT NULL,
    "district_id" INTEGER NOT NULL,
    "confirmed_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_district_spelling_confirmations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "member_district_spelling_confirmations_member_id_idx" ON "member_district_spelling_confirmations"("member_id");

ALTER TABLE "member_district_spelling_confirmations" ADD CONSTRAINT "member_district_spelling_confirmations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_district_spelling_confirmations" ADD CONSTRAINT "member_district_spelling_confirmations_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_district_spelling_confirmations" ADD CONSTRAINT "member_district_spelling_confirmations_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
