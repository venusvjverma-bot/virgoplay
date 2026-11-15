CREATE POLICY "temp_anon_update_login_assets"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'login-assets');
