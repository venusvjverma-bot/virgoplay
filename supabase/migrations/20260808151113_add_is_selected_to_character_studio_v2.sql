/*
# Add is_selected column to character_studio_v2

## Purpose
Adds a `is_selected` boolean column to the `character_studio_v2` table so that
the Mother Creator can mark exactly one character as the "Selected / Current"
working character. This is distinct from `status` (active/draft):
  - status = 'active' means the character is ready in the library
  - is_selected = true means this is the character the Mother is currently working with

Only ONE character per creator can be is_selected = true at any time. A partial
unique index enforces this invariant at the database level.

## Changes
1. New column: `is_selected` (boolean, not null, default false) on character_studio_v2
2. Partial unique index: only one row per creator_id where is_selected = true
3. A trigger function that automatically unsets is_selected on all other rows
   for the same creator_id when one row is set to is_selected = true, ensuring
   the single-selected invariant is maintained atomically.

## Security
- RLS already enabled on character_studio_v2 (existing policies unchanged).
- The new column is covered by existing owner-scoped policies.
- The trigger runs with SECURITY DEFINER to bypass RLS for the cross-row update
  (unsetting other rows), but is owned by the postgres role and only fires on
  INSERT/UPDATE from the owner's own write — RLS still gates the triggering write.
*/

ALTER TABLE character_studio_v2
  ADD COLUMN IF NOT EXISTS is_selected boolean NOT NULL DEFAULT false;

-- Enforce one selected character per creator at the DB level
DROP INDEX IF EXISTS character_studio_v2_one_selected_per_creator;
CREATE UNIQUE INDEX character_studio_v2_one_selected_per_creator
  ON character_studio_v2 (creator_id)
  WHERE is_selected = true;

-- Trigger function: when a row is set is_selected = true, clear all other
-- rows for the same creator_id. This keeps the invariant atomic without
-- requiring the frontend to do a two-step update.
CREATE OR REPLACE FUNCTION enforce_single_selected_character()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_selected = true THEN
    UPDATE character_studio_v2
      SET is_selected = false
      WHERE creator_id = NEW.creator_id
        AND id <> NEW.id
        AND is_selected = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_selected_character ON character_studio_v2;
CREATE TRIGGER trg_enforce_single_selected_character
  AFTER INSERT OR UPDATE OF is_selected ON character_studio_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_selected_character();
