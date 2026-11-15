/*
# Character Videos — Read Access for Verified Child Creators

## Purpose
Allows verified (approved) Creator accounts to READ the Mother Creator's
character videos for a Character they have selected. This completes the
data path: Selected Character → Character ID → Character Video.

This mirrors the existing `csv2_select_master_for_verified` pattern already
used on `character_studio_v2` so Child Creators can read the Mother's shared
content. It is a one-way, read-only grant — Child Creators cannot insert,
update, or delete the Mother Creator's videos.

## Changes
### 1. character_videos — new SELECT policy
- Adds `cv_select_master_for_verified` policy.
- Allows any authenticated creator whose `verification_status = 'approved'`
  to SELECT rows on `character_videos` whose `creator_id` belongs to a
  Mother Creator (`is_content_master = true` on the creators table).
- The existing owner-scoped policies (`select_own_character_videos`, etc.)
  remain unchanged — the Mother Creator still has full CRUD on her own rows.
- No INSERT/UPDATE/DELETE policy changes — Child Creators cannot modify
  the Mother Creator's videos.

## Security
- Only SELECT access is granted to verified Child Creators.
- The predicate checks BOTH:
  a) the video's `creator_id` belongs to a content master, AND
  b) the calling user is a verified (`approved`) creator.
- Storage bucket `character_videos` is already public-read, so video URLs
  are accessible regardless of table-level access.
*/

DROP POLICY IF EXISTS "cv_select_master_for_verified" ON character_videos;

CREATE POLICY "cv_select_master_for_verified"
ON character_videos FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM creators c
    WHERE c.id = character_videos.creator_id
    AND c.is_content_master = true
  )
  AND EXISTS (
    SELECT 1 FROM creators me
    WHERE me.id = auth.uid()
    AND me.verification_status = 'approved'
  )
);