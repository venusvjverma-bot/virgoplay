-- Replace system-admin-only UPDATE policies with ownership-aware policies.
-- Super admin may edit any dialogue package.
-- A creator may edit only packages where creator_id = auth.uid().

-- ── dialogue_packages ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "dlg_pkg_update_system_admin" ON dialogue_packages;
DROP POLICY IF EXISTS "dlg_pkg_update_own"          ON dialogue_packages;

CREATE POLICY "dlg_pkg_update_owner_or_admin" ON dialogue_packages
  FOR UPDATE TO authenticated
  USING  (is_super_admin() OR creator_id = auth.uid())
  WITH CHECK (is_super_admin() OR creator_id = auth.uid());

-- ── dialogue_package_assets ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "dlg_assets_update_system_admin" ON dialogue_package_assets;

CREATE POLICY "dlg_assets_update_owner_or_admin" ON dialogue_package_assets
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_assets.package_id
        AND (is_super_admin() OR dp.creator_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_assets.package_id
        AND (is_super_admin() OR dp.creator_id = auth.uid())
    )
  );

-- ── dialogue_package_responses ───────────────────────────────────────────────
DROP POLICY IF EXISTS "dlg_resp_update_system_admin" ON dialogue_package_responses;

CREATE POLICY "dlg_resp_update_owner_or_admin" ON dialogue_package_responses
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_responses.package_id
        AND (is_super_admin() OR dp.creator_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_responses.package_id
        AND (is_super_admin() OR dp.creator_id = auth.uid())
    )
  );
