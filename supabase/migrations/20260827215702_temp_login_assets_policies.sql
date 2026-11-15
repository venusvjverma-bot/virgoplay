CREATE POLICY "temp_anon_insert_login_assets"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'login-assets');

CREATE POLICY "temp_anon_update_login_assets"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'login-assets');

CREATE POLICY "temp_anon_delete_login_assets"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'login-assets');
