/*
# Temporary INSERT policy for login-assets bucket

## Purpose
Temporarily allow inserting objects into the login-assets bucket so we can
upload the Chat Library banner image. This policy will be removed in a
follow-up migration.

## Security
- INSERT policy on storage.objects for login-assets bucket
- Scoped to anon, authenticated (temporary)
*/

DROP POLICY IF EXISTS "temp_insert_login_assets" ON storage.objects;
CREATE POLICY "temp_insert_login_assets"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'login-assets');
