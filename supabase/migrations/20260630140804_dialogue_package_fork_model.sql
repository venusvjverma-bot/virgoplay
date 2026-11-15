-- Implement Option B: Creator-Owned Override Copy model.
-- System packages remain immutable. Creators fork their own private copy on first edit.
-- Subsequent edits update only the creator's copy. Deleting the copy resets to system default.

-- ── 1. Add source_package_id for fork provenance ──────────────────────────────
-- Null on system packages. Points to the system package on creator overrides.
-- SET NULL on parent delete so orphaned overrides don't cascade-delete.
ALTER TABLE dialogue_packages
  ADD COLUMN source_package_id uuid REFERENCES dialogue_packages(id) ON DELETE SET NULL;

-- ── 2. Relax package_code uniqueness to allow one override per creator per code ─
-- The original inline UNIQUE constraint prevents duplicate package_codes entirely.
-- Replace with partial unique indexes: one system row + one override per creator per code.
ALTER TABLE dialogue_packages DROP CONSTRAINT dialogue_packages_package_code_key;

CREATE UNIQUE INDEX idx_dlg_pkg_unique_system_code
  ON dialogue_packages (package_code)
  WHERE is_system = true;

CREATE UNIQUE INDEX idx_dlg_pkg_unique_creator_override
  ON dialogue_packages (package_code, creator_id)
  WHERE is_system = false AND creator_id IS NOT NULL;

-- ── 3. DELETE policies ────────────────────────────────────────────────────────
-- Creators may delete their own override packages (enables "Reset to Default").
-- CASCADE handles child rows (dialogue_package_assets, dialogue_package_responses).

CREATE POLICY "dlg_pkg_delete_own" ON dialogue_packages
  FOR DELETE TO authenticated
  USING (creator_id = auth.uid() AND is_system = false);

-- Child tables need explicit DELETE policies for CASCADE to succeed under RLS.
CREATE POLICY "dlg_assets_delete_own" ON dialogue_package_assets
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_assets.package_id
        AND dp.creator_id = auth.uid()
        AND dp.is_system = false
    )
  );

CREATE POLICY "dlg_resp_delete_own" ON dialogue_package_responses
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_responses.package_id
        AND dp.creator_id = auth.uid()
        AND dp.is_system = false
    )
  );
