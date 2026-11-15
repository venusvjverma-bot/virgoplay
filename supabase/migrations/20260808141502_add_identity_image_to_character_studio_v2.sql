/*
# Add identity image columns to character_studio_v2

1. Modified Tables
- `character_studio_v2`
  - `identity_image_url` (text, nullable) — public URL of the uploaded identity image
  - `identity_asset_id` (text, nullable) — optional asset ID from storage/ZenCreator flow

2. Security
- No RLS policy changes needed — existing owner-scoped policies cover the new columns.

3. Important Notes
- These columns are nullable so existing rows are unaffected.
- The identity image is scoped to the character record it belongs to.
*/

ALTER TABLE character_studio_v2
  ADD COLUMN IF NOT EXISTS identity_image_url text,
  ADD COLUMN IF NOT EXISTS identity_asset_id text;
