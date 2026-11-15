/*
# Create character-identities Storage Bucket

## Purpose
Create a public Storage bucket to hold canonical character identity images
generated through the text-to-image pipeline. Each image is stored with a path
keyed by the creator's UUID so RLS can scope access.

## Changes
- New Storage bucket `character-identities` (public, 10MB limit, png/jpeg/webp).
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 'character-identities', 'character-identities', true, 10485760,
       ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'character-identities');

-- Storage policies: creators can manage their own folder.
DROP POLICY IF EXISTS "Users can upload own character identities" ON storage.objects;
CREATE POLICY "Users can upload own character identities"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'character-identities' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can read own character identities" ON storage.objects;
CREATE POLICY "Users can read own character identities"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'character-identities' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Public can read character identities" ON storage.objects;
CREATE POLICY "Public can read character identities"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'character-identities');
