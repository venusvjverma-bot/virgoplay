CREATE POLICY "temp_anon_insert_login_assets"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'login-assets');
