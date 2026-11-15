/*
# Create login_videos table + storage bucket for Login Video Carousel

1. Purpose
   Adds a "Video Carousel" section to the /login page where an admin/operator
   can upload MP4 videos, preview them, reorder, and save the selection.
   This is intentionally single-tenant / operator-managed content shown on the
   public login screen, so anon + authenticated roles both get full CRUD.

2. New Storage Bucket
   - `login-videos` (private bucket, MP4 only, 100 MB file size limit)
     Stores the raw MP4 files. Signed URLs are used to display them since the
     bucket is private (videos are operator-managed, not public assets).

3. New Table
   - `login_videos`
     - `id`            uuid primary key
     - `title`         text, optional display label
     - `storage_path`  text, the object key inside the `login-videos` bucket
     - `video_url`     text, the signed URL (refreshed on save) for preview
     - `sort_order`    int, default 0, controls carousel order
     - `is_selected`   boolean, default true, whether the video appears in the carousel
     - `created_at`    timestamptz default now()
     - `updated_at`    timestamptz default now()

4. Security
   - RLS enabled on `login_videos`.
   - Four CRUD policies scoped to `anon, authenticated` (single-tenant operator content).
   - Storage bucket policies: anon + authenticated can read/write/delete objects in `login-videos`.

5. Notes
   - No auth changes, no existing tables touched.
   - `video_url` stores a signed URL with a long expiry so the carousel can
     display videos without per-render signing; the save flow refreshes it.
*/

-- ── Storage bucket ─────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'login-videos',
  'login-videos',
  false,
  104857600,                       -- 100 MB
  ARRAY['video/mp4']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage policies ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "login_videos_storage_read" ON storage.objects;
CREATE POLICY "login_videos_storage_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'login-videos');

DROP POLICY IF EXISTS "login_videos_storage_insert" ON storage.objects;
CREATE POLICY "login_videos_storage_insert"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'login-videos');

DROP POLICY IF EXISTS "login_videos_storage_update" ON storage.objects;
CREATE POLICY "login_videos_storage_update"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'login-videos') WITH CHECK (bucket_id = 'login-videos');

DROP POLICY IF EXISTS "login_videos_storage_delete" ON storage.objects;
CREATE POLICY "login_videos_storage_delete"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'login-videos');

-- ── Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_videos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text,
  storage_path text NOT NULL,
  video_url    text,
  sort_order   integer NOT NULL DEFAULT 0,
  is_selected  boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE login_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_login_videos" ON login_videos;
CREATE POLICY "anon_select_login_videos"
  ON login_videos FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_login_videos" ON login_videos;
CREATE POLICY "anon_insert_login_videos"
  ON login_videos FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_login_videos" ON login_videos;
CREATE POLICY "anon_update_login_videos"
  ON login_videos FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_login_videos" ON login_videos;
CREATE POLICY "anon_delete_login_videos"
  ON login_videos FOR DELETE
  TO anon, authenticated USING (true);

-- ── updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS login_videos_touch ON login_videos;
CREATE TRIGGER login_videos_touch
  BEFORE UPDATE ON login_videos
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();