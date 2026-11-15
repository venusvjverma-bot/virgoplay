-- Disable the client self-service test credits action.
-- The "Add Test Credits" UI was removed from the Client Dashboard; clients must
-- not be able to grant themselves test credits through this functionality, so
-- EXECUTE is revoked from the public client roles. The function body is kept
-- (unused by the app) to avoid any history rewrite; admin credit granting,
-- Buy Credits, purchase history, and all payment logic are untouched.

REVOKE EXECUTE ON FUNCTION client_add_test_credits(uuid, text) FROM anon, authenticated;