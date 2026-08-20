CREATE TABLE "district_aliases" (
    "id" SERIAL NOT NULL,
    "alias" TEXT NOT NULL,
    "district_id" INTEGER NOT NULL,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "district_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "district_aliases_alias_key" ON "district_aliases"("alias");

CREATE INDEX "district_aliases_district_id_idx" ON "district_aliases"("district_id");

ALTER TABLE "district_aliases" ADD CONSTRAINT "district_aliases_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "district_aliases" ADD CONSTRAINT "district_aliases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
