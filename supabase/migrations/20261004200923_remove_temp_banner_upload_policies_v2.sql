/*
# Remove temporary storage upload policies for login-assets bucket

## Purpose
Removes the temporary INSERT and UPDATE policies that were added to allow
uploading the new Chat Library banner as an independent asset. The banner
is now stored at `login-assets/chat-library-banner.png` and does not depend
on the V-Card image.
*/

DROP POLICY IF EXISTS "temp_anon_upload_banner" ON storage.objects;
DROP POLICY IF EXISTS "temp_anon_update_banner" ON storage.objects;
