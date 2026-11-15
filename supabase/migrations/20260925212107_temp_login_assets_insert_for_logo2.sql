-- Temporary INSERT policy to upload "logo 2" to the login-assets bucket.
-- Removed in the next migration.
DROP POLICY IF EXISTS "temp_insert_login_assets_logo2" ON storage.objects;
CREATE POLICY "temp_insert_login_assets_logo2"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'login-assets');
