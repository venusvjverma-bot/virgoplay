-- ============================================================
-- Drop ALL existing policies on every affected table.
-- Previous migrations left duplicates; this is a clean slate.
-- ============================================================

-- creators
DROP POLICY IF EXISTS "sel_own"                      ON creators;
DROP POLICY IF EXISTS "ins_own"                      ON creators;
DROP POLICY IF EXISTS "upd_own"                      ON creators;
DROP POLICY IF EXISTS "del_own"                      ON creators;
DROP POLICY IF EXISTS "admin_sel_all"                ON creators;
DROP POLICY IF EXISTS "admin_upd_all"                ON creators;
DROP POLICY IF EXISTS "admins_select_all_creators"   ON creators;
DROP POLICY IF EXISTS "admins_update_all_creators"   ON creators;
DROP POLICY IF EXISTS "creators_select_own"          ON creators;
DROP POLICY IF EXISTS "creators_insert_own"          ON creators;
DROP POLICY IF EXISTS "creators_update_own"          ON creators;
DROP POLICY IF EXISTS "creators_delete_own"          ON creators;
DROP POLICY IF EXISTS "pub_approved"                 ON creators;
DROP POLICY IF EXISTS "public_select_approved_creators" ON creators;

-- creator_profiles
DROP POLICY IF EXISTS "cp_sel_own"                   ON creator_profiles;
DROP POLICY IF EXISTS "cp_ins_own"                   ON creator_profiles;
DROP POLICY IF EXISTS "cp_upd_own"                   ON creator_profiles;
DROP POLICY IF EXISTS "cp_del_own"                   ON creator_profiles;
DROP POLICY IF EXISTS "cp_pub"                       ON creator_profiles;
DROP POLICY IF EXISTS "cp_admin_sel"                 ON creator_profiles;
DROP POLICY IF EXISTS "admins_select_all_profiles"   ON creator_profiles;
DROP POLICY IF EXISTS "profiles_select_own"          ON creator_profiles;
DROP POLICY IF EXISTS "profiles_insert_own"          ON creator_profiles;
DROP POLICY IF EXISTS "profiles_update_own"          ON creator_profiles;
DROP POLICY IF EXISTS "profiles_delete_own"          ON creator_profiles;
DROP POLICY IF EXISTS "public_select_approved_profiles" ON creator_profiles;

-- verification_documents
DROP POLICY IF EXISTS "vd_sel_own"                   ON verification_documents;
DROP POLICY IF EXISTS "vd_ins_own"                   ON verification_documents;
DROP POLICY IF EXISTS "vd_upd_own"                   ON verification_documents;
DROP POLICY IF EXISTS "vd_del_own"                   ON verification_documents;
DROP POLICY IF EXISTS "vd_admin_sel"                 ON verification_documents;
DROP POLICY IF EXISTS "vd_admin_upd"                 ON verification_documents;
DROP POLICY IF EXISTS "vdocs_select_own"             ON verification_documents;
DROP POLICY IF EXISTS "vdocs_insert_own"             ON verification_documents;
DROP POLICY IF EXISTS "vdocs_update_own"             ON verification_documents;
DROP POLICY IF EXISTS "vdocs_delete_own"             ON verification_documents;
DROP POLICY IF EXISTS "admins_select_all_vdocs"      ON verification_documents;
DROP POLICY IF EXISTS "admins_update_all_vdocs"      ON verification_documents;

-- ============================================================
-- SECURITY DEFINER function: check admin role WITHOUT RLS.
-- This is the standard Supabase pattern to avoid recursive
-- "infinite recursion detected in policy for relation creators".
-- Running as the function owner bypasses row-level security
-- on the internal SELECT, so no policy re-evaluation happens.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.creators
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ============================================================
-- Recreate creators policies (clean, no self-referencing)
-- ============================================================
CREATE POLICY "sel_own"       ON creators FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "ins_own"       ON creators FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "upd_own"       ON creators FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "del_own"       ON creators FOR DELETE TO authenticated
  USING (auth.uid() = id);

-- Anyone (anon + authenticated) can see approved-creator rows (for public portal)
CREATE POLICY "pub_approved"  ON creators FOR SELECT TO anon, authenticated
  USING (verification_status = 'approved');

-- Admins can read / update any creator row (uses SECURITY DEFINER — no recursion)
CREATE POLICY "admin_sel_all" ON creators FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin_upd_all" ON creators FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- Recreate creator_profiles policies (clean)
-- ============================================================
CREATE POLICY "cp_sel_own"   ON creator_profiles FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

CREATE POLICY "cp_ins_own"   ON creator_profiles FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "cp_upd_own"   ON creator_profiles FOR UPDATE TO authenticated
  USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());

CREATE POLICY "cp_del_own"   ON creator_profiles FOR DELETE TO authenticated
  USING (creator_id = auth.uid());

-- Public portal: anyone can read profiles of verified creators
CREATE POLICY "cp_pub"       ON creator_profiles FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.creators c
    WHERE c.id = creator_profiles.creator_id
      AND c.verification_status = 'approved'
  ));

-- Admins can read all profiles
CREATE POLICY "cp_admin_sel" ON creator_profiles FOR SELECT TO authenticated
  USING (public.is_admin());

-- ============================================================
-- Recreate verification_documents policies (clean)
-- ============================================================
CREATE POLICY "vd_sel_own"   ON verification_documents FOR SELECT TO authenticated
  USING (creator_id = auth.uid());

CREATE POLICY "vd_ins_own"   ON verification_documents FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "vd_upd_own"   ON verification_documents FOR UPDATE TO authenticated
  USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());

CREATE POLICY "vd_del_own"   ON verification_documents FOR DELETE TO authenticated
  USING (creator_id = auth.uid());

-- Admins can read and update any verification document
CREATE POLICY "vd_admin_sel" ON verification_documents FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "vd_admin_upd" ON verification_documents FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
