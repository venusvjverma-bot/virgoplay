/*
# Revoke unnecessary table-level grants on clients

## Purpose
Defense in depth: the previous migration removed the permissive RLS
INSERT and UPDATE policies, so RLS now blocks anonymous writes. However,
the table-level grants for UPDATE, INSERT, DELETE, and TRUNCATE on the
clients table still exist for both anon and authenticated roles (inherited
from the initial schema setup). This migration revokes those grants so
the table grants match the intended access model:

- anon: SELECT only (client lookup by id)
- authenticated: SELECT only (admin reads client list)
- All writes go through SECURITY DEFINER functions that validate authority

## What is NOT changed
- No policies are modified.
- No columns, data, or balances are changed.
- The SECURITY DEFINER functions (admin_update_client, client_update_profile,
  client_add_test_credits) run as the table owner and bypass these grants.
- Edge functions use the service role and are unaffected.
*/
REVOKE UPDATE ON clients FROM anon, authenticated;
REVOKE INSERT ON clients FROM anon, authenticated;
REVOKE DELETE ON clients FROM anon, authenticated;
REVOKE TRUNCATE ON clients FROM anon, authenticated;
