-- Test-fixture client for isolated dummy-purchase verification.
-- Created with a NULL auth user linkage (clients.id is an independent UUID,
-- not FK'd to auth.users), email on an .invalid domain, and immediately
-- marked inactive so it can never be used for a real login/session.
-- This row exists purely to exercise client_purchase_action end-to-end.
-- Cleanup drops it (and its orders via FK cascade) after testing.

INSERT INTO clients (id, email, email_verified, is_active, full_name, country, credit_balance)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'test-fixture-purchase@example.invalid',
  false,
  true,
  'TEST FIXTURE — DO NOT USE',
  'SE',
  0
);
