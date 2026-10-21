-- Links a Spouse record to the independently-enrolled Member it refers to, when their Ghana
-- Card IDs match (a member's spouse who is themselves also a GNAT member). Nullable, SetNull on
-- delete: an informational cross-reference, not an ownership relation -- see schema.prisma for
-- the full rationale.
ALTER TABLE "spouses" ADD COLUMN "linked_member_id" INTEGER;

ALTER TABLE "spouses" ADD CONSTRAINT "spouses_linked_member_id_fkey" FOREIGN KEY ("linked_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "spouses_linked_member_id_idx" ON "spouses"("linked_member_id");
