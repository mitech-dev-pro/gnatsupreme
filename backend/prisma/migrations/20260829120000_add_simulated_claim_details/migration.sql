ALTER TABLE external_claim_submissions
  ADD COLUMN claim_type benefit_type,
  ADD COLUMN claimant_type TEXT,
  ADD COLUMN claimant_name TEXT,
  ADD COLUMN incident_date DATE,
  ADD COLUMN estimated_amount DECIMAL(12,2),
  ADD COLUMN payment_method TEXT,
  ADD COLUMN payment_details JSONB,
  ADD COLUMN document_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN notes TEXT;
