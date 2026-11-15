-- Allow anon uploads to login-assets bucket (for one-time asset provisioning)
CREATE POLICY "anon_insert_login_assets"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'login-assets');
