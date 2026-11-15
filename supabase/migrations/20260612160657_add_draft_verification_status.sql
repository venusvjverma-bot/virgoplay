-- Add 'draft' as a valid verification_status value and change the default
-- so newly registered creators don't appear in the admin review queue
-- until they have actually submitted their documents.

ALTER TABLE creators
  DROP CONSTRAINT IF EXISTS creators_verification_status_check;

ALTER TABLE creators
  ADD CONSTRAINT creators_verification_status_check
    CHECK (verification_status IN ('draft', 'pending', 'approved', 'rejected'));

ALTER TABLE creators
  ALTER COLUMN verification_status SET DEFAULT 'draft';

-- Backfill: creators who have no verification_documents row and are still
-- 'pending' were never actually submitted — reset them to 'draft'.
UPDATE creators
SET verification_status = 'draft'
WHERE verification_status = 'pending'
  AND role = 'creator'
  AND id NOT IN (SELECT DISTINCT creator_id FROM verification_documents);
