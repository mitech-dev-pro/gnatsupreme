ALTER TABLE external_claim_submissions
  ADD COLUMN claimant_id_type TEXT,
  ADD COLUMN claimant_id_number TEXT,
  ADD COLUMN claimant_contact JSONB;
