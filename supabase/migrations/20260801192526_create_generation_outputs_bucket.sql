-- Storage bucket for all Generation Engine V2 outputs (images, videos, audio).
-- Public read so generated assets can be displayed; writes via service role only
-- (edge functions use the service role key to upload).

INSERT INTO storage.buckets (id, name, public)
VALUES ('generation-outputs', 'generation-outputs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read of generated outputs.
CREATE POLICY "public_read_generation_outputs"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'generation-outputs');

-- Allow authenticated users to upload into their own folder.
CREATE POLICY "auth_upload_generation_outputs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'generation-outputs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to update their own outputs.
CREATE POLICY "auth_update_generation_outputs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'generation-outputs' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'generation-outputs' AND (storage.foldername(name))[1] = auth.uid()::text);
