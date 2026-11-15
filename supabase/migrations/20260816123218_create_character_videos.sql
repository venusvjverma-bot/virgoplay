/*
# Character Videos — character-level video carousel

## Purpose
Stores short (10–15s) character videos uploaded from the Character Studio V2
DEV ON mode "Character Video" section. Videos belong to a Character ID
(character_studio_v2), NOT a Role ID. This is Mother-Creator-only management
storage; no Child Creator or Client Portal wiring in this migration.

## 1. New Tables
- `character_videos`
  - `id`              uuid PK
  - `character_id`    uuid FK -> character_studio_v2(id) ON DELETE CASCADE
  - `creator_id`      uuid NOT NULL DEFAULT auth.uid()  (owner = uploading creator)
  - `video_url`       text  (public URL of the uploaded video)
  - `video_path`      text  (storage object path, used for delete/replace)
  - `duration_seconds` int  (optional, client-measured clip length)
  - `sort_order`      int   default 0 (carousel ordering)
  - `created_at`      timestamptz default now()
  - `updated_at`      timestamptz default now()

## 2. Indexes
- `character_videos_character_id_idx` on `character_id` (carousel load)
- `character_videos_creator_id_idx`   on `creator_id`

## 3. Storage
- New public bucket `character_videos` (public read; writes via RLS).
- Storage policies: creators manage objects under their own prefix
  `${creator_id}/...`. Public read is allowed since these are preview assets.

## 4. Security (RLS)
- `character_videos` table: owner-scoped CRUD via `auth.uid() = creator_id`.
  SELECT scoped to authenticated (Mother Creator in DEV ON mode).
  INSERT/UPDATE/DELETE scoped to the owning creator.
- Storage bucket `character_videos`: public SELECT; INSERT/UPDATE/DELETE
  restricted to the owning creator's prefix.

## 5. Notes
- This migration is idempotent (IF NOT EXISTS, DROP POLICY IF EXISTS).
- No changes to character_studio_v2, role tables, or any existing table.
- No Child Creator / Client Portal integration.
*/

CREATE TABLE IF NOT EXISTS character_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES character_studio_v2(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL DEFAULT auth.uid(),
  video_url text NOT NULL,
  video_path text NOT NULL,
  duration_seconds integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS character_videos_character_id_idx
  ON character_videos(character_id);
CREATE INDEX IF NOT EXISTS character_videos_creator_id_idx
  ON character_videos(creator_id);

ALTER TABLE character_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_character_videos" ON character_videos;
CREATE POLICY "select_own_character_videos" ON character_videos
  FOR SELECT TO authenticated USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "insert_own_character_videos" ON character_videos;
CREATE POLICY "insert_own_character_videos" ON character_videos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "update_own_character_videos" ON character_videos;
CREATE POLICY "update_own_character_videos" ON character_videos
  FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "delete_own_character_videos" ON character_videos;
CREATE POLICY "delete_own_character_videos" ON character_videos
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('character_videos', 'character_videos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, owner-scoped write
DROP POLICY IF EXISTS "public_read_character_videos" ON storage.objects;
CREATE POLICY "public_read_character_videos" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'character_videos');

DROP POLICY IF EXISTS "insert_own_character_videos_storage" ON storage.objects;
CREATE POLICY "insert_own_character_videos_storage" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'character_videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "update_own_character_videos_storage" ON storage.objects;
CREATE POLICY "update_own_character_videos_storage" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'character_videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "delete_own_character_videos_storage" ON storage.objects;
CREATE POLICY "delete_own_character_videos_storage" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'character_videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );