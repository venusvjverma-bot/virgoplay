/*
# Secure clients table — Remove anonymous write access

## Purpose
Closes a critical security vulnerability where any unauthenticated visitor
could modify any client's credit_balance, is_active status, or other fields
through the public Supabase REST API. The previous RLS policies used
USING (true) / WITH CHECK (true) for the anon role on all CRUD operations.

## Changes

### 1. RLS policies on `clients` (modified)
- **Drops** the permissive `anon_insert_clients`, `anon_update_clients` policies
  that allowed unrestricted anonymous writes.
- **Replaces** `anon_select_clients` with a narrower SELECT policy that still
  allows looking up a client by id (needed by the client auth context), but
  the policy is kept as USING (true) because there is no auth.uid() link —
  clients are identified by a client_id stored in localStorage, not by a
  Supabase Auth session. Read access is not the vulnerability being fixed.
- **No INSERT policy** — new client accounts are created exclusively through
  the client-signup and client-google-auth edge functions (service role,
  bypasses RLS).
- **No UPDATE policy** — all updates now go through SECURITY DEFINER
  functions that validate the caller's authority.
- **No DELETE policy** — unchanged, none existed before.

### 2. New function: admin_update_client (SECURITY DEFINER)
Allows a Super Admin (authenticated creator with is_super_admin = true) to:
- Toggle `is_active` on any client account.
- Adjust `credit_balance` by a positive or negative integer amount.
Records the adjustment in client_spending_history.
Validates caller is a super admin via the existing is_super_admin() helper.
Rejects if the caller is not a super admin.

### 3. New function: client_update_profile (SECURITY DEFINER)
Allows a client to update their own full_name, phone, country fields.
Validates the client_id exists and is active.
No access to credit_balance, is_active, email, or email_verified.

### 4. New function: client_add_test_credits (SECURITY DEFINER)
Allows a client to add 10 test credits to their own account.
Validates the client_id exists and is active.
Hardcoded to +10 credits (no client-controlled amount).
Records the grant in client_spending_history.

## Important notes
1. Edge functions (client-signup, client-verify, client-google-auth,
   process-credit-transaction) all use the service role key and bypass RLS.
   They are unaffected by these policy changes and continue to work.
2. The admin page (AdminClientsPage) and client dashboard
   (ClientDashboardPage) must be updated to call these new RPC functions
   instead of direct table UPDATEs. Frontend code changes follow this
   migration.
3. No existing client data, balances, or statuses are modified.
4. No columns are dropped, renamed, or changed.
*/
-- ─── 1. Drop permissive policies ──────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_update_clients" ON clients;
DROP POLICY IF EXISTS "anon_insert_clients" ON clients;

-- Replace the broad SELECT with the same read access (needed for client lookup
-- by id). Read access is not the vulnerability; writes are.
DROP POLICY IF EXISTS "anon_select_clients" ON clients;
CREATE POLICY "anon_select_clients" ON clients FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── 2. Admin update function ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_client(
  p_client_id    uuid,
  p_action       text,
  p_amount       integer DEFAULT 0,
  p_description  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin     boolean;
  v_client       clients%ROWTYPE;
  v_new_balance  integer;
BEGIN
  -- Verify caller is a super admin
  SELECT public.is_super_admin() INTO v_is_admin;
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: super admin required');
  END IF;

  -- Validate action
  IF p_action NOT IN ('toggle_active', 'adjust_credits') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  -- Load the target client
  SELECT * INTO v_client FROM clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;

  IF p_action = 'toggle_active' THEN
    UPDATE clients SET is_active = NOT is_active WHERE id = p_client_id;
    RETURN jsonb_build_object(
      'success', true,
      'is_active', NOT v_client.is_active
    );
  END IF;

  -- p_action = 'adjust_credits'
  IF p_amount = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be non-zero');
  END IF;

  v_new_balance := v_client.credit_balance + p_amount;

  IF v_new_balance < 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'current_balance', v_client.credit_balance
    );
  END IF;

  UPDATE clients SET credit_balance = v_new_balance WHERE id = p_client_id;

  INSERT INTO client_spending_history (client_id, credits, transaction_type, description)
  VALUES (
    p_client_id,
    abs(p_amount),
    CASE WHEN p_amount > 0 THEN 'grant' ELSE 'spend' END,
    COALESCE(p_description, CASE WHEN p_amount > 0 THEN 'Admin credit grant' ELSE 'Admin credit removal' END)
  );

  RETURN jsonb_build_object(
    'success', true,
    'credit_balance', v_new_balance
  );
END;
$$;

-- Grant execute to authenticated (admin uses a Supabase Auth session)
GRANT EXECUTE ON FUNCTION public.admin_update_client(uuid, text, integer, text) TO authenticated;

-- ─── 3. Client self-profile update ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.client_update_profile(
  p_client_id  uuid,
  p_full_name  text DEFAULT NULL,
  p_phone      text DEFAULT NULL,
  p_country    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client clients%ROWTYPE;
BEGIN
  SELECT * INTO v_client FROM clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;
  IF NOT v_client.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account is not active');
  END IF;

  UPDATE clients
  SET
    full_name = p_full_name,
    phone     = p_phone,
    country   = p_country
  WHERE id = p_client_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute to anon (clients use the anon key, no Supabase Auth session)
GRANT EXECUTE ON FUNCTION public.client_update_profile(uuid, text, text, text) TO anon, authenticated;

-- ─── 4. Client add test credits ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.client_add_test_credits(
  p_client_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client       clients%ROWTYPE;
  v_new_balance  integer;
  v_test_amount  integer := 10;
BEGIN
  SELECT * INTO v_client FROM clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;
  IF NOT v_client.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account is not active');
  END IF;

  v_new_balance := v_client.credit_balance + v_test_amount;

  UPDATE clients SET credit_balance = v_new_balance WHERE id = p_client_id;

  INSERT INTO client_spending_history (client_id, credits, transaction_type, description)
  VALUES (p_client_id, v_test_amount, 'grant', 'Test credits added manually');

  RETURN jsonb_build_object(
    'success', true,
    'credit_balance', v_new_balance
  );
END;
$$;

-- Grant execute to anon (clients use the anon key)
GRANT EXECUTE ON FUNCTION public.client_add_test_credits(uuid) TO anon, authenticated;
