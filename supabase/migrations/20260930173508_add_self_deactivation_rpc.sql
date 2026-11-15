/*
# Self-Deactivation for Child Creators

## Purpose
Allows a Child Creator to temporarily deactivate their own account by setting
the existing `is_temporarily_deactivated` flag to `true`. This is a one-way
operation — the creator cannot reactivate themselves; only a super admin can
toggle the flag back to `false` via the existing `set_creator_deactivation` RPC.

## Changes

### 1. New SECURITY DEFINER function: `self_deactivate`
- No parameters.
- Sets `is_temporarily_deactivated = true` on the caller's own `creators` row.
- Security:
  - Uses `auth.uid()` to identify the caller — can only affect the caller's own row.
  - Only sets the flag to `true` (deactivate). There is no self-reactivation path.
  - SECURITY DEFINER is required because direct UPDATE on
    `is_temporarily_deactivated` is revoked from `anon` and `authenticated`
    (see the original temporary deactivation migration).
- Returns `void`.

### 2. Grant execute
- Granted to `authenticated` so any signed-in creator can call it for their own row.

### 3. Existing admin system unchanged
- The existing `set_creator_deactivation(uuid, boolean)` RPC remains the only
  way to toggle the flag back to `false` (reactivate). It still requires
  `is_super_admin = true`.
- The admin Temporary Deactivate toggle reads the same `is_temporarily_deactivated`
  column, so it will automatically display ON after a creator self-deactivates.

### 4. No new columns or tables
- Reuses the existing `is_temporarily_deactivated` column on `creators`.
- No schema changes to any table.
*/

CREATE OR REPLACE FUNCTION public.self_deactivate()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to deactivate your account';
  END IF;

  UPDATE public.creators
  SET is_temporarily_deactivated = true
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.self_deactivate() TO authenticated;
