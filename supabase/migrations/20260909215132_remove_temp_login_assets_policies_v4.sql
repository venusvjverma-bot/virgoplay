/*
# Remove temporary login-assets policies

## Purpose
Remove the temporary INSERT and DELETE policies that were added to upload
the Chat Library banner image. These are no longer needed.
*/

DROP POLICY IF EXISTS "temp_insert_login_assets" ON storage.objects;
DROP POLICY IF EXISTS "temp_delete_login_assets" ON storage.objects;
