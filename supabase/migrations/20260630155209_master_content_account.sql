-- Master Content Account architecture.
-- Introduces the is_content_master role flag on creators.
-- The account holding this flag owns all canonical content.
-- Assign by flipping the flag — no hard-coded emails or IDs in application code.
-- Currently assigned to the development account (test.test@gmail.com).

-- ── 1. Add role flag ──────────────────────────────────────────────────────────
ALTER TABLE creators ADD COLUMN is_content_master boolean NOT NULL DEFAULT false;

-- ── 2. Assign development content master (test.test@gmail.com) ───────────────
-- This account is the canonical content owner during development.
-- To migrate: set this row to false and set the new account to true.
UPDATE creators
SET is_content_master = true
WHERE id = '3fd4bcde-bc7c-497e-9433-386a829824e6';

-- ── 3. SECURITY DEFINER helper (same pattern as is_super_admin()) ─────────────
-- Prevents RLS recursion and keeps policies readable.
CREATE OR REPLACE FUNCTION is_content_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_content_master FROM creators WHERE id = auth.uid()),
    false
  );
$$;

-- ── 4. Content master can UPDATE system dialogue packages ─────────────────────
CREATE POLICY "dlg_pkg_update_system_content_master" ON dialogue_packages
  FOR UPDATE TO authenticated
  USING  (is_system = true AND is_content_master())
  WITH CHECK (is_system = true AND is_content_master());

-- ── 5. Content master can UPDATE assets of system packages ────────────────────
CREATE POLICY "dlg_assets_update_system_content_master" ON dialogue_package_assets
  FOR UPDATE TO authenticated
  USING (
    is_content_master() AND
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_assets.package_id AND dp.is_system = true
    )
  )
  WITH CHECK (
    is_content_master() AND
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_assets.package_id AND dp.is_system = true
    )
  );

-- ── 6. Content master can UPDATE responses of system packages ─────────────────
CREATE POLICY "dlg_resp_update_system_content_master" ON dialogue_package_responses
  FOR UPDATE TO authenticated
  USING (
    is_content_master() AND
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_responses.package_id AND dp.is_system = true
    )
  )
  WITH CHECK (
    is_content_master() AND
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_responses.package_id AND dp.is_system = true
    )
  );
