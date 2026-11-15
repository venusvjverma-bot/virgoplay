/*
# Create Character Studio V2 table

1. New Tables
- `character_studio_v2`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `creator_id` (uuid, not null, references creators.id ON DELETE CASCADE)
  - `name` (text, not null) — character display name
  - `bio` (text, nullable) — long description / backstory, up to ~5000 chars
  - `status` (text, not null, default 'draft') — 'draft' or 'active'
  - `is_my_ai` (boolean, not null, default false) — reserved "My AI" card flag
  - `sort_order` (integer, not null, default 0) — display ordering
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Security
- Enable RLS on `character_studio_v2`.
- Owner-scoped CRUD: each authenticated creator can only access rows they own.
- `creator_id` defaults to `auth.uid()` so inserts that omit it still satisfy WITH CHECK.

3. Important Notes
- This is a SEPARATE table from the existing `master_ai_characters` table.
- The old Character Studio is untouched — no modifications to existing tables.
- Only the Mother Creator (test.test@gmail.com) will use this in the UI, but RLS
  is owner-scoped so any authenticated creator could use it if exposed.
- A unique partial index ensures only one `is_my_ai = true` row per creator.
*/

CREATE TABLE IF NOT EXISTS character_studio_v2 (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES creators(id) ON DELETE CASCADE,
  name        text NOT NULL,
  bio         text,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active')),
  is_my_ai    boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE character_studio_v2 ENABLE ROW LEVEL SECURITY;

-- Only one "My AI" reserved card per creator
CREATE UNIQUE INDEX IF NOT EXISTS uq_character_studio_v2_my_ai
  ON character_studio_v2 (creator_id)
  WHERE is_my_ai = true;

DROP POLICY IF EXISTS "csv2_select_own" ON character_studio_v2;
CREATE POLICY "csv2_select_own"
  ON character_studio_v2 FOR SELECT
  TO authenticated
  USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "csv2_insert_own" ON character_studio_v2;
CREATE POLICY "csv2_insert_own"
  ON character_studio_v2 FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "csv2_update_own" ON character_studio_v2;
CREATE POLICY "csv2_update_own"
  ON character_studio_v2 FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "csv2_delete_own" ON character_studio_v2;
CREATE POLICY "csv2_delete_own"
  ON character_studio_v2 FOR DELETE
  TO authenticated
  USING (auth.uid() = creator_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION fn_csv2_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_csv2_updated_at ON character_studio_v2;
CREATE TRIGGER trg_csv2_updated_at
  BEFORE UPDATE ON character_studio_v2
  FOR EACH ROW
  EXECUTE FUNCTION fn_csv2_updated_at();
