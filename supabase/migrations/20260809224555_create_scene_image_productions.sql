/*
# Create scene_image_productions table

1. Purpose
   Persists Scene Image Production records: the scene prompt, generation
   configuration (model / ratio / number_of_images), and the generated
   result (image URL, asset ID, generation ID, status). Each row belongs
   to one creator + one role + one scene slot.

2. New Tables
   - `scene_image_productions`
     - id (uuid, PK)
     - creator_id (uuid, NOT NULL — owner of the row)
     - role_id (uuid, NOT NULL — which character role this scene is for)
     - scene_id (text, NOT NULL — the dev scene slot identifier)
     - scene_label (text — human-readable scene label)
     - prompt (text — the scene prompt text)
     - gen_tool (text, default 'image_editor')
     - gen_model (text, default 'FLUX_KLEIN_NSFW')
     - gen_ratio (text, default '9:16')
     - gen_number_of_images (integer, default 1)
     - identity_asset_id (text — Character Studio V2 identity asset ID, tracking only)
     - identity_image_url (text — Character Studio V2 identity image URL, used as reference)
     - role_image_url (text — Role Image URL, used as reference)
     - role_image_asset_id (text — Role Image asset ID, tracking only)
     - scene_image_url (text — generated scene image URL)
     - scene_image_asset_id (text — generated scene asset ID)
     - scene_image_status (text, default 'Pending')
     - scene_image_generation_id (uuid — links to generations table)
     - created_at (timestamptz)
     - updated_at (timestamptz)

3. Security
   - RLS enabled.
   - 4 owner-scoped CRUD policies (SELECT/INSERT/UPDATE/DELETE) scoped
     TO authenticated with auth.uid() = creator_id.
*/

CREATE TABLE IF NOT EXISTS scene_image_productions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  role_id uuid NOT NULL,
  scene_id text NOT NULL,
  scene_label text,
  prompt text NOT NULL DEFAULT '',
  gen_tool text NOT NULL DEFAULT 'image_editor',
  gen_model text NOT NULL DEFAULT 'FLUX_KLEIN_NSFW',
  gen_ratio text NOT NULL DEFAULT '9:16',
  gen_number_of_images integer NOT NULL DEFAULT 1,
  identity_asset_id text,
  identity_image_url text,
  role_image_url text,
  role_image_asset_id text,
  scene_image_url text,
  scene_image_asset_id text,
  scene_image_status text NOT NULL DEFAULT 'Pending',
  scene_image_generation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scene_image_productions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_scene_image_productions" ON scene_image_productions;
CREATE POLICY "select_own_scene_image_productions" ON scene_image_productions
  FOR SELECT TO authenticated USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "insert_own_scene_image_productions" ON scene_image_productions;
CREATE POLICY "insert_own_scene_image_productions" ON scene_image_productions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "update_own_scene_image_productions" ON scene_image_productions;
CREATE POLICY "update_own_scene_image_productions" ON scene_image_productions
  FOR UPDATE TO authenticated USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "delete_own_scene_image_productions" ON scene_image_productions;
CREATE POLICY "delete_own_scene_image_productions" ON scene_image_productions
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);

CREATE INDEX IF NOT EXISTS idx_scene_image_productions_creator_role_scene
  ON scene_image_productions (creator_id, role_id, scene_id);
