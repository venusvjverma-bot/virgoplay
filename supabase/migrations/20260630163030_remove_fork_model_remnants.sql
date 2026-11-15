-- Remove all fork-model (Option B / creator-owned override) remnants.
-- Restore clean two-actor ownership:
--   • Super admin   → can edit system packages (platform governance)
--   • Content master → can edit system packages (canonical content authorship)
--   • Creators       → read-only consumers of canonical content

-- ══════════════════════════════════════════════════════════════════════════════
-- dialogue_packages
-- ══════════════════════════════════════════════════════════════════════════════

-- Drop fork-model policies
DROP POLICY IF EXISTS "dlg_pkg_insert_own"            ON dialogue_packages;
DROP POLICY IF EXISTS "dlg_pkg_read_own"              ON dialogue_packages;
DROP POLICY IF EXISTS "dlg_pkg_update_owner_or_admin" ON dialogue_packages;
DROP POLICY IF EXISTS "dlg_pkg_delete_own"            ON dialogue_packages;

-- Restore clean super-admin UPDATE scoped to system packages only
-- (was dropped by migration 20260630135116 when owner_or_admin replaced it)
CREATE POLICY "dlg_pkg_update_system_admin" ON dialogue_packages
  FOR UPDATE TO authenticated
  USING  (is_system = true AND is_super_admin())
  WITH CHECK (is_system = true AND is_super_admin());

-- ══════════════════════════════════════════════════════════════════════════════
-- dialogue_package_assets
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "dlg_assets_insert_own"            ON dialogue_package_assets;
DROP POLICY IF EXISTS "dlg_assets_read_own"              ON dialogue_package_assets;
DROP POLICY IF EXISTS "dlg_assets_update_owner_or_admin" ON dialogue_package_assets;
DROP POLICY IF EXISTS "dlg_assets_delete_own"            ON dialogue_package_assets;

CREATE POLICY "dlg_assets_update_system_admin" ON dialogue_package_assets
  FOR UPDATE TO authenticated
  USING (
    is_super_admin() AND
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_assets.package_id AND dp.is_system = true
    )
  )
  WITH CHECK (
    is_super_admin() AND
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_assets.package_id AND dp.is_system = true
    )
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- dialogue_package_responses
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "dlg_resp_insert_own"            ON dialogue_package_responses;
DROP POLICY IF EXISTS "dlg_resp_read_own"              ON dialogue_package_responses;
DROP POLICY IF EXISTS "dlg_resp_update_owner_or_admin" ON dialogue_package_responses;
DROP POLICY IF EXISTS "dlg_resp_delete_own"            ON dialogue_package_responses;

CREATE POLICY "dlg_resp_update_system_admin" ON dialogue_package_responses
  FOR UPDATE TO authenticated
  USING (
    is_super_admin() AND
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_responses.package_id AND dp.is_system = true
    )
  )
  WITH CHECK (
    is_super_admin() AND
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_responses.package_id AND dp.is_system = true
    )
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- Indexes
-- ══════════════════════════════════════════════════════════════════════════════

-- Drop the per-creator-per-code partial unique index (fork model constraint)
DROP INDEX IF EXISTS idx_dlg_pkg_unique_creator_override;
