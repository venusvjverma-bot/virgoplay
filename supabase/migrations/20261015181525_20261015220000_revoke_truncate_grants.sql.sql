/*
# Revoke remaining TRUNCATE grants on client tables

The previous migration revoked INSERT, UPDATE, DELETE but TRUNCATE
was missed. This removes the remaining TRUNCATE grant from both
client_spending_history and client_media_unlocks for anon and
authenticated roles.
*/
REVOKE TRUNCATE ON client_spending_history FROM anon, authenticated;
REVOKE TRUNCATE ON client_media_unlocks FROM anon, authenticated;