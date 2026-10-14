-- Splits SPOUSE into HUSBAND/WIFE and SIBLING into BROTHER/SISTER for new beneficiaries.
-- SPOUSE and SIBLING are kept on the enum (not removed) so existing beneficiary rows saved
-- before this split keep reading back correctly; the application only stops offering them as
-- selectable options for new/updated beneficiaries (see RELATIONSHIPS in the frontend and
-- member.schemas.ts/member-import.service.ts on the backend).
ALTER TYPE "beneficiary_relationship" ADD VALUE 'HUSBAND';
ALTER TYPE "beneficiary_relationship" ADD VALUE 'WIFE';
ALTER TYPE "beneficiary_relationship" ADD VALUE 'BROTHER';
ALTER TYPE "beneficiary_relationship" ADD VALUE 'SISTER';
