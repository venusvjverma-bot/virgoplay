/*
# Add age and country columns to character_studio_v2

1. Modified Tables
- `character_studio_v2`
  - `age` (integer, nullable) — optional age value (20–60) for the character
  - `country` (text, nullable) — optional country name for the character

2. Notes
- Both columns are nullable so existing characters without age/country continue to work.
- No RLS changes needed — existing policies already cover the new columns.
- No data migration needed — existing rows get NULL for both columns.
*/

ALTER TABLE character_studio_v2
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS country text;
