-- Remove the temporary anon insert policy; upload is complete
DROP POLICY IF EXISTS "anon_insert_login_assets" ON storage.objects;
