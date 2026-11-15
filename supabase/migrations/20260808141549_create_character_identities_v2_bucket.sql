/*
# Create character_identities_v2 storage bucket

1. New Storage Bucket
- `character_identities_v2` — public read, authenticated write
  - Used by Character Studio V2 to store identity images per character
  - 10 MB file size limit
  - Allowed MIME types: image/jpeg, image/png, image/webp

2. Security (Storage Policies)
- Public SELECT (anyone can view identity images)
- Authenticated INSERT (owner-scoped: folder name[1] must match auth.uid())
- Authenticated UPDATE (owner-scoped)
- Authenticated DELETE (owner-scoped)

3. Important Notes
- Separate from any existing bucket — dedicated to Character Studio V2.
- Files are namespaced by creator_id: `{creator_id}/{character_id}-{timestamp}.{ext}`
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'character_identities_v2',
  'character_identities_v2',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- SELECT: public read
DROP POLICY IF EXISTS "csv2_storage_select" ON storage.objects;
CREATE POLICY "csv2_storage_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'character_identities_v2');

-- INSERT: owner-scoped (folder name[1] = auth.uid())
DROP POLICY IF EXISTS "csv2_storage_insert" ON storage.objects;
CREATE POLICY "csv2_storage_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'character_identities_v2'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: owner-scoped
DROP POLICY IF EXISTS "csv2_storage_update" ON storage.objects;
CREATE POLICY "csv2_storage_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'character_identities_v2'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'character_identities_v2'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: owner-scoped
DROP POLICY IF EXISTS "csv2_storage_delete" ON storage.objects;
CREATE POLICY "csv2_storage_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'character_identities_v2'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
