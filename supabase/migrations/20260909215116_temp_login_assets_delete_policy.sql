/*
# Temporary DELETE policy for login-assets bucket

## Purpose
Temporarily allow deleting objects from the login-assets bucket so we can
remove a stale metadata row and re-upload the banner image.
*/

DROP POLICY IF EXISTS "temp_delete_login_assets" ON storage.objects;
CREATE POLICY "temp_delete_login_assets"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'login-assets');
