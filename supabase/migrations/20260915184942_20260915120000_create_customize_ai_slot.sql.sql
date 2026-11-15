/*
# Create Customize AI Reserved Slot and Per-Creator Override Table

## Purpose
Adds a new reserved "Customize AI" V-card slot to Character Studio V2,
completely separate from the existing "My AI" slot. The Mother Creator
owns the shared slot and its generation configuration. Each Child Creator
gets their own override row for appearance data, generated prompt, and
generated image.

## Changes to character_studio_v2 (shared table)
1. New column: `is_customize_ai` (boolean, default false)
   - Marks the reserved Customize AI slot, parallel to `is_my_ai`.
2. New columns for Customize AI generation config (isolated from My AI):
   - `customize_ai_gen_model` (text)
   - `customize_ai_gen_ratio` (text)
   - `customize_ai_gen_num_images` (integer)
   - `customize_ai_gen_output_format` (text)
   - `customize_ai_gen_thinking` (text)
   - `customize_ai_gen_prompt_optimization_mode` (text)

## New table: customize_ai_overrides
Per-creator override data for the Customize AI slot.
- `creator_id` (uuid, NOT NULL) — the Child Creator who owns this row
- `character_id` (uuid, NOT NULL) — FK to the shared Customize AI slot
- `appearance_data` (jsonb) — structured appearance field selections
- `generated_prompt` (text) — Mini Prompt Builder output
- `generated_image_url` (text) — generated image result
- `generated_image_status` (text) — '' / 'Processing' / 'Ready' / 'Failed'
- `generated_generation_id` (uuid) — generation record reference
- `selected_image_url` (text) — image chosen as V-card identity
- `display_name` (text) — optional custom name
- `created_at` / `updated_at` (timestamptz)

Primary key: (creator_id, character_id)

## Security
- RLS enabled on customize_ai_overrides.
- 4 CRUD policies scoped to auth.uid() = creator_id (owner-only).
- The Mother Creator can read all rows via the service-role client in
  edge functions (bypassing RLS) for Dev inspection.

## Important Notes
1. This migration does NOT modify any existing My AI columns, policies,
   or behavior.
2. The existing is_my_ai column and all my_ai_* columns are untouched.
3. The character_studio_v2 RLS policies already cover the new
   is_customize_ai column — no new policies needed on that table.
*/

-- ── Add is_customize_ai column ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2'
    AND column_name = 'is_customize_ai'
  ) THEN
    ALTER TABLE character_studio_v2
    ADD COLUMN is_customize_ai boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ── Add Customize AI generation config columns ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2'
    AND column_name = 'customize_ai_gen_model'
  ) THEN
    ALTER TABLE character_studio_v2
    ADD COLUMN customize_ai_gen_model text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2'
    AND column_name = 'customize_ai_gen_ratio'
  ) THEN
    ALTER TABLE character_studio_v2
    ADD COLUMN customize_ai_gen_ratio text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2'
    AND column_name = 'customize_ai_gen_num_images'
  ) THEN
    ALTER TABLE character_studio_v2
    ADD COLUMN customize_ai_gen_num_images integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2'
    AND column_name = 'customize_ai_gen_output_format'
  ) THEN
    ALTER TABLE character_studio_v2
    ADD COLUMN customize_ai_gen_output_format text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2'
    AND column_name = 'customize_ai_gen_thinking'
  ) THEN
    ALTER TABLE character_studio_v2
    ADD COLUMN customize_ai_gen_thinking text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2'
    AND column_name = 'customize_ai_gen_prompt_optimization_mode'
  ) THEN
    ALTER TABLE character_studio_v2
    ADD COLUMN customize_ai_gen_prompt_optimization_mode text;
  END IF;
END $$;

-- ── Create customize_ai_overrides table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS customize_ai_overrides (
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES character_studio_v2(id) ON DELETE CASCADE,
  appearance_data jsonb,
  generated_prompt text,
  generated_image_url text,
  generated_image_status text DEFAULT '',
  generated_generation_id uuid,
  selected_image_url text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (creator_id, character_id)
);

ALTER TABLE customize_ai_overrides ENABLE ROW LEVEL SECURITY;

-- Owner-scoped CRUD: each creator can only access their own override row
DROP POLICY IF EXISTS "select_own_customize_ai" ON customize_ai_overrides;
CREATE POLICY "select_own_customize_ai"
ON customize_ai_overrides FOR SELECT
TO authenticated USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "insert_own_customize_ai" ON customize_ai_overrides;
CREATE POLICY "insert_own_customize_ai"
ON customize_ai_overrides FOR INSERT
TO authenticated WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "update_own_customize_ai" ON customize_ai_overrides;
CREATE POLICY "update_own_customize_ai"
ON customize_ai_overrides FOR UPDATE
TO authenticated USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "delete_own_customize_ai" ON customize_ai_overrides;
CREATE POLICY "delete_own_customize_ai"
ON customize_ai_overrides FOR DELETE
TO authenticated USING (auth.uid() = creator_id);
