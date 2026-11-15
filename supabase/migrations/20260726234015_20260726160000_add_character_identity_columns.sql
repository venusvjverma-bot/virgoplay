/*
# Add Character Identity Columns to master_ai_characters

## Purpose
Extend the master_ai_characters table to store the full "Character Identity"
metadata that Promptchan returns (or that we derive) after a text-to-image
generation. This lets future generations reuse the saved identity instead of
creating a completely new face.

## Changes

### Modified Table: `master_ai_characters`
New columns:
- `identity_image_url` (text) — URL of the canonical identity image in Supabase Storage
- `identity_image_path` (text) — Storage path for the identity image
- `provider_character_id` (text, nullable) — reusable character ID from the provider, if exposed
- `provider_metadata` (jsonb) — full provider response metadata (gems, seed used, style, etc.)
- `identity_saved_at` (timestamptz, nullable) — when the identity was locked in

## Security
- No new tables. RLS already enabled; existing owner-scoped policies cover the new columns.
*/

ALTER TABLE master_ai_characters
  ADD COLUMN IF NOT EXISTS identity_image_url   text,
  ADD COLUMN IF NOT EXISTS identity_image_path  text,
  ADD COLUMN IF NOT EXISTS provider_character_id text,
  ADD COLUMN IF NOT EXISTS provider_metadata    jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS identity_saved_at   timestamptz;
