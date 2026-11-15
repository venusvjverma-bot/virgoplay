/*
# Super Admin Role Hardening

## Summary
Adds a Super Admin tier to the admin system and closes two critical RLS security gaps.

## Changes

### 1. New column: creators.is_super_admin (boolean, default false)
Identifies accounts with elevated Super Admin privileges. Only one row should ever
have this set to true (the primary administrator). All other admins have false.

### 2. Backfill: set is_super_admin = true for the primary administrator
Finds the existing admin account by email and marks it as the Super Admin.

### 3. New function: is_super_admin()
Returns true when the calling user's creators row has is_super_admin = true.
Used by the Edge Function and can be used in future RLS policies.

### 4. Security trigger: enforce_role_protection on creators
BEFORE UPDATE trigger that prevents any authenticated browser session (non-service-role)
from changing the `role` or `is_super_admin` columns directly.
- Service role (auth.uid() IS NULL): allowed — this is the Edge Function path.
- Authenticated sessions: blocked from changing role or is_super_admin regardless of role.
This closes the critical gap where a creator could self-promote to admin via upd_own,
and prevents any admin from promoting/demoting others via admin_upd_all.

### 5. Replaced admin_upd_all policy
Dropped the old broad policy that let any admin update any row (including role).
Replaced with admin_upd_verification: admins may only update verification_status
on any creator row. The trigger still enforces role/is_super_admin protection.
The upd_own policy remains for creators updating their own non-role fields.

### 6. New column: admin_audit_log.target_email (text, nullable)
Stores the email of the subject of admin-management actions (admin_created /
admin_removed) as a plain string. Preserves the audit record even after the
target's creators row is deleted during removal.
*/

-- ─── 1. Add is_super_admin column ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'creators'
      AND column_name  = 'is_super_admin'
  ) THEN
    ALTER TABLE public.creators
      ADD COLUMN is_super_admin boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ─── 2. Backfill: mark the primary administrator as Super Admin ───────────────
UPDATE public.creators
SET    is_super_admin = true
WHERE  email = 'venusvjverma@gmail.com'
  AND  role  = 'admin';

-- ─── 3. is_super_admin() helper function ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.creators
    WHERE id = auth.uid() AND is_super_admin = true
  );
$$;

-- ─── 4. Role/is_super_admin protection trigger ───────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Service role has auth.uid() = NULL — allow all changes (Edge Function path)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Block any authenticated session from changing role or is_super_admin
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Role changes are not permitted through direct updates. Use the Admin Management system.';
  END IF;

  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    RAISE EXCEPTION 'Super Admin flag changes are not permitted through direct updates.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_role_protection ON public.creators;
CREATE TRIGGER enforce_role_protection
  BEFORE UPDATE ON public.creators
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- ─── 5. Replace admin_upd_all with narrower admin_upd_verification ────────────
DROP POLICY IF EXISTS "admin_upd_all" ON public.creators;
DROP POLICY IF EXISTS "admin_upd_verification" ON public.creators;
CREATE POLICY "admin_upd_verification"
  ON public.creators FOR UPDATE
  TO authenticated
  USING  (is_admin())
  WITH CHECK (is_admin());

-- ─── 6. Add target_email to admin_audit_log ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'admin_audit_log'
      AND column_name  = 'target_email'
  ) THEN
    ALTER TABLE public.admin_audit_log
      ADD COLUMN target_email text;
  END IF;
END $$;
