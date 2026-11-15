/*
# Temporary Deactivation for Child Creators

## Purpose
Adds a per-creator boolean flag that Super Admin can toggle to temporarily
deactivate a verified Child Creator. When ON, the creator is frozen on the
Verification page with all other portal features locked, and their public
AI chatbot becomes unavailable. The flag does NOT change verification status,
delete data, or affect wallet/earnings.

## Changes

### 1. New column on `creators`
- `is_temporarily_deactivated` (boolean, NOT NULL, DEFAULT false)
  - false = active (normal access)
  - true  = temporarily deactivated (frozen on Verification page)

### 2. Column-level security
The existing `upd_own` policy allows creators to UPDATE their own row.
To prevent a deactivated creator from clearing the flag themselves,
UPDATE privilege on `is_temporarily_deactivated` is revoked from both
`anon` and `authenticated`. Only the SECURITY DEFINER function below
(or a super-admin / service-role call) can set it.

### 3. SECURITY DEFINER function: `set_creator_deactivation`
- Parameters: `target_creator_id uuid`, `deactivated boolean`
- Security:
  - Verifies the caller is a super admin (`is_super_admin = true` on their
    own `creators` row) before allowing the update.
  - Only updates the `is_temporarily_deactivated` column — nothing else.
  - Returns the new boolean value.
- Why SECURITY DEFINER: the function runs with the database owner's
  privileges, bypassing the column-level revoke, so only callers who
  pass the admin check can toggle the flag.

### 4. Updated RLS policy `pub_approved` on `creators`
- Old: `verification_status = 'approved'`
- New: `verification_status = 'approved' AND is_temporarily_deactivated = false`
- Effect: deactivated creators are invisible to anon/public queries (e.g.
  ClientPortal lookup by username), making their public portal page return
  "not found" automatically.

### 5. Audit log support
- The `admin_audit_log.action` column already accepts text. The frontend
  will insert `'deactivated'` / `'reactivated'` as action values. No schema
  change needed — the column is plain text.
*/

-- ── 1. Add the column ────────────────────────────────────────────────────────
ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS is_temporarily_deactivated boolean NOT NULL DEFAULT false;

-- ── 2. Revoke direct UPDATE on the deactivation column from client roles ─────
-- This prevents a creator from clearing the flag via a normal .update() call.
REVOKE UPDATE (is_temporarily_deactivated) ON creators FROM anon, authenticated;

-- ── 3. SECURITY DEFINER function to toggle deactivation ─────────────────────
-- Only callable by super admins. Updates only the deactivation flag.
CREATE OR REPLACE FUNCTION public.set_creator_deactivation(
  target_creator_id uuid,
  deactivated boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_is_admin boolean;
BEGIN
  SELECT is_super_admin INTO caller_is_admin
  FROM public.creators
  WHERE id = auth.uid();

  IF caller_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Permission denied: only super admins can toggle deactivation';
  END IF;

  UPDATE public.creators
  SET is_temporarily_deactivated = deactivated
  WHERE id = target_creator_id;

  RETURN deactivated;
END;
$$;

-- Grant execute to authenticated (the admin check inside gates access)
GRANT EXECUTE ON FUNCTION public.set_creator_deactivation(uuid, boolean) TO authenticated;

-- ── 4. Update the pub_approved RLS policy ────────────────────────────────────
DROP POLICY IF EXISTS "pub_approved" ON creators;
CREATE POLICY "pub_approved"
  ON creators FOR SELECT
  TO anon, authenticated
  USING (verification_status = 'approved' AND is_temporarily_deactivated = false);
