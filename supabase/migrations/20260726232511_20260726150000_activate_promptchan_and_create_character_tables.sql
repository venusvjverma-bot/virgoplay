/*
# Activate Promptchan as Image Provider + Create Master AI Character Tables

## Purpose
1. Sets Promptchan as the active image provider (deactivating Fal.ai).
2. Creates tables for the Master AI Character workflow.

## Changes

### 1. Provider Activation
- Sets `is_active = true` for Promptchan, `false` for all other image providers.

### 2. New Table: `master_ai_characters`
Stores the structured character definition (Master AI Character JSON).
- `id`, `creator_id` (defaults to auth.uid()), `name`, `character_data` (jsonb),
  `seed`, `style_filter`, `is_active`, timestamps.

### 3. New Table: `generated_images`
Stores images generated through the pipeline.
- `id`, `creator_id`, `character_id` (FK), `provider_name`, `prompt_used`,
  `image_url`, `provider_image_id`, `seed_used`, `status`, `created_at`.

## Security
- RLS enabled on both tables. Owner-scoped CRUD policies.
*/

-- ── 1. Activate Promptchan ─────────────────────────────────────────────────────
UPDATE provider_configurations
  SET is_active = (provider_name = 'Promptchan' AND service_type = 'image'),
      updated_at = now()
WHERE service_type = 'image';

-- ── 2. master_ai_characters ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS master_ai_characters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  character_data  jsonb NOT NULL DEFAULT '{}'::jsonb,
  seed            integer NOT NULL DEFAULT -1,
  style_filter    text NOT NULL DEFAULT 'Default',
  is_active       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE master_ai_characters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_characters" ON master_ai_characters;
CREATE POLICY "select_own_characters" ON master_ai_characters
  FOR SELECT TO authenticated
  USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "insert_own_characters" ON master_ai_characters;
CREATE POLICY "insert_own_characters" ON master_ai_characters
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "update_own_characters" ON master_ai_characters;
CREATE POLICY "update_own_characters" ON master_ai_characters
  FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "delete_own_characters" ON master_ai_characters;
CREATE POLICY "delete_own_characters" ON master_ai_characters
  FOR DELETE TO authenticated
  USING (auth.uid() = creator_id);

-- ── 3. generated_images ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generated_images (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id          uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id        uuid REFERENCES master_ai_characters(id) ON DELETE SET NULL,
  provider_name       text NOT NULL DEFAULT 'Promptchan',
  prompt_used        text NOT NULL DEFAULT '',
  image_url           text,
  provider_image_id   text,
  seed_used           integer,
  status              text NOT NULL DEFAULT 'pending',
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE generated_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_generated_images" ON generated_images;
CREATE POLICY "select_own_generated_images" ON generated_images
  FOR SELECT TO authenticated
  USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "insert_own_generated_images" ON generated_images;
CREATE POLICY "insert_own_generated_images" ON generated_images
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "update_own_generated_images" ON generated_images;
CREATE POLICY "update_own_generated_images" ON generated_images
  FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "delete_own_generated_images" ON generated_images;
CREATE POLICY "delete_own_generated_images" ON generated_images
  FOR DELETE TO authenticated
  USING (auth.uid() = creator_id);

CREATE INDEX IF NOT EXISTS idx_mac_creator ON master_ai_characters(creator_id);
CREATE INDEX IF NOT EXISTS idx_gi_creator ON generated_images(creator_id);
CREATE INDEX IF NOT EXISTS idx_gi_character ON generated_images(character_id);
