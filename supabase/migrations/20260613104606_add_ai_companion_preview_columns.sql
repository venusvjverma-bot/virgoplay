ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS front_face_photo_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS left_face_photo_url  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS right_face_photo_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS creator_consent      boolean NOT NULL DEFAULT false;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'face-photos',
  'face-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/jpg']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "face_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'face-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "face_photos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'face-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "face_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'face-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "face_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'face-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
