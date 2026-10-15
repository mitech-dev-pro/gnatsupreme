-- Resets one member so they go through self-service account setup from scratch:
-- /member-auth/lookup and /member-auth/setup-account treat them as never having set up an
-- account, and /member-portal/onboarding treats Ghana Card ID, spouse, and beneficiaries as
-- never having been provided.
--
-- Spouse and beneficiary rows are deleted outright, not nulled: leaving them in place would
-- make onboarding think they're "already on file" and refuse re-entry, and the spouse's Ghana
-- Card ID (globally unique across the spouses table) would still be occupied if the member
-- re-enters the same one for a new/returning spouse.
--
-- Usage:
--   psql "$DATABASE_URL" -f reset-member-setup.sql
-- after editing the \set line below, or paste the \set line plus the block you want into an
-- interactive psql session.
--
-- This runs as one transaction. To check what it WOULD do without applying anything, replace
-- the final COMMIT with ROLLBACK and read the output -- row counts and the two SELECTs still
-- print either way.

\set controller_id 'GNATTS2024012'

BEGIN;

-- Confirm this is the right member before anything below runs.
SELECT id, controller_id, full_name, status, ghana_card_id, email, password_hash IS NOT NULL AS has_password
FROM members WHERE controller_id = :'controller_id';

-- Spouse-linked documents (e.g. a marriage certificate): this only removes the database row --
-- the underlying file on disk at storage_path is NOT deleted. Note these paths if you want to
-- clean them up separately; they'll be orphaned on disk otherwise.
SELECT sf.id, sf.storage_path, sf.download_path
FROM stored_files sf
JOIN spouses sp ON sp.id = sf.spouse_id
JOIN members m ON m.id = sp.member_id
WHERE m.controller_id = :'controller_id';

DELETE FROM stored_files
WHERE spouse_id IN (
  SELECT sp.id FROM spouses sp JOIN members m ON m.id = sp.member_id WHERE m.controller_id = :'controller_id'
);

DELETE FROM spouses
WHERE member_id = (SELECT id FROM members WHERE controller_id = :'controller_id');

DELETE FROM beneficiaries
WHERE member_id = (SELECT id FROM members WHERE controller_id = :'controller_id');

-- Any pending change request for this member is now stale -- it may target a beneficiary that no
-- longer exists, or propose a spouse/detail change that's moot once setup is redone. Cancelled,
-- not deleted, so the audit trail (who requested what, when) is preserved.
UPDATE member_change_requests
SET status = 'CANCELLED', updated_at = now()
WHERE member_id = (SELECT id FROM members WHERE controller_id = :'controller_id')
  AND status = 'PENDING';

-- Revoke any active session and unconsumed password reset token -- a stale session token
-- shouldn't keep working once the account is reset back to "not set up."
UPDATE member_sessions
SET revoked_at = now()
WHERE member_id = (SELECT id FROM members WHERE controller_id = :'controller_id')
  AND revoked_at IS NULL;

UPDATE member_password_reset_tokens
SET consumed_at = now()
WHERE member_id = (SELECT id FROM members WHERE controller_id = :'controller_id')
  AND consumed_at IS NULL;

-- Clear everything self-service setup collects.
UPDATE members
SET password_hash = NULL,
    email = NULL,
    ghana_card_id = NULL,
    spouse_declaration_status = 'UNKNOWN'
WHERE controller_id = :'controller_id';

-- OPTIONAL: only relevant for a district-less (NON_TEACHING) member who picked a district during
-- setup-account -- uncomment to let them pick again too. Do NOT run this for a member who
-- already had a district before setup; it would wipe a legitimate, pre-existing assignment.
-- UPDATE members SET district_id = NULL, region_id = NULL WHERE controller_id = :'controller_id';

-- Review the output above, then COMMIT to apply or ROLLBACK to discard.
COMMIT;
