-- Allow super_admin users to update system dialogue packages during development authoring.
-- Uses the existing is_super_admin() SECURITY DEFINER function.
-- Additive policies only — no table structure changes.

CREATE POLICY "dlg_pkg_update_system_admin" ON dialogue_packages
  FOR UPDATE TO authenticated
  USING  (is_system = true AND is_super_admin())
  WITH CHECK (is_system = true AND is_super_admin());

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
