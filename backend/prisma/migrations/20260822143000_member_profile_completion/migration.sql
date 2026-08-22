CREATE TYPE spouse_declaration_status AS ENUM ('UNKNOWN', 'NONE', 'HAS_SPOUSE');

ALTER TABLE members
ADD COLUMN spouse_declaration_status spouse_declaration_status NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN profile_completion_dismissed_at TIMESTAMP(3);

UPDATE members
SET spouse_declaration_status = 'HAS_SPOUSE'
WHERE EXISTS (
  SELECT 1 FROM spouses WHERE spouses.member_id = members.id
);
