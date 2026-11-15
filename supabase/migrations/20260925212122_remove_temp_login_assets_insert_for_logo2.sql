-- Remove the temporary INSERT policy used to upload "logo 2"
DROP POLICY IF EXISTS "temp_insert_login_assets_logo2" ON storage.objects;
