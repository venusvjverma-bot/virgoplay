/*
# Character Studio V2 — Development View settings (per creator)

Stores the "Development View" toggle state per creator account.
- One row per creator (unique on creator_id)
- dev_mode boolean: true = internal/dev view ON, false = OFF
- Only test.test@gmail.com will ever see the toggle in the UI; all other
  accounts are forced to dev_mode = false (off) by the application logic.
- Default for test.test@gmail.com = true (on).

Security:
- RLS enabled, owner-scoped CRUD (same pattern as character_studio_v2).
- creator_id defaults to auth.uid() so inserts satisfy WITH CHECK.
*/

CREATE TABLE IF NOT EXISTS character_studio_v2_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES creators(id) ON DELETE CASCADE,
  dev_mode    boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE character_studio_v2_settings ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_csv2_settings_creator
  ON character_studio_v2_settings (creator_id);

DROP POLICY IF EXISTS "csv2_settings_select_own" ON character_studio_v2_settings;
CREATE POLICY "csv2_settings_select_own"
  ON character_studio_v2_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "csv2_settings_insert_own" ON character_studio_v2_settings;
CREATE POLICY "csv2_settings_insert_own"
  ON character_studio_v2_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "csv2_settings_update_own" ON character_studio_v2_settings;
CREATE POLICY "csv2_settings_update_own"
  ON character_studio_v2_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "csv2_settings_delete_own" ON character_studio_v2_settings;
CREATE POLICY "csv2_settings_delete_own"
  ON character_studio_v2_settings FOR DELETE
  TO authenticated
  USING (auth.uid() = creator_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION fn_csv2_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_csv2_settings_updated_at ON character_studio_v2_settings;
CREATE TRIGGER trg_csv2_settings_updated_at
  BEFORE UPDATE ON character_studio_v2_settings
  FOR EACH ROW
  EXECUTE FUNCTION fn_csv2_settings_updated_at();
