/*
# Temporary: Allow anon upload to login-assets bucket for banner replacement

## Purpose
Temporarily grants the anon role INSERT + UPDATE permissions on the
`login-assets` storage bucket so the new Chat Library banner (sourced
from the Mother Account V-Card image) can be uploaded as an independent
asset at `login-assets/chat-library-banner.png`.

This policy will be removed in a follow-up migration immediately after
the upload completes.
*/

-- Temporarily allow anon to insert into login-assets bucket
DROP POLICY IF EXISTS "temp_anon_upload_banner" ON storage.objects;
CREATE POLICY "temp_anon_upload_banner"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'login-assets');

-- Also allow anon to update (for upsert)
DROP POLICY IF EXISTS "temp_anon_update_banner" ON storage.objects;
CREATE POLICY "temp_anon_update_banner"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'login-assets');
