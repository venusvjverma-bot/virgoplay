/*
# Fix character_roles FK to support Character Studio V2

## Problem
`character_roles.character_id` has a foreign key constraint referencing
`master_ai_characters(id)` only. Character Studio V2 characters live in a
separate table (`character_studio_v2`), so inserting a role linked to a V2
character is rejected with a FK violation.

## Solution
1. Drop the restrictive FK constraint `character_roles_character_id_fkey`.
   The `character_id` column remains (uuid, same data) — it now accepts IDs
   from either `master_ai_characters` or `character_studio_v2`.

2. Add cascade-delete triggers on BOTH source tables so that deleting a
   character from either table still cleans up orphaned roles — preserving
   the ON DELETE CASCADE behavior the original FK provided.

## Changes
- Dropped constraint: `character_roles_character_id_fkey`
- New trigger function: `cascade_delete_character_roles()` — fires on DELETE
  from either `master_ai_characters` or `character_studio_v2`, removes all
  `character_roles` rows whose `character_id` matches the deleted row's id.
- New triggers on both tables: `trg_cascade_delete_roles_from_legacy` and
  `trg_cascade_delete_roles_from_v2`.

## Security
- No RLS changes. Triggers run as SECURITY DEFINER (postgres) so they can
  delete from character_roles regardless of RLS — same authority the original
  FK ON DELETE CASCADE had.
- No data is lost. Existing roles keep their character_id values. The only
  change is the constraint removal.

## Notes
1. The frontend already loads characters from both tables and merges them
   into a single list, so no code changes are needed for the lookup path.
2. The insert path in Role Studio already passes the selected character's
   UUID as character_id — it was only failing because of the FK. With the
   FK removed, V2 character IDs are accepted.
3. identity_asset_id and identity_image_url remain available because the
   V2 character row in character_studio_v2 is untouched; the frontend
   loads it by ID as before.
*/

-- 1. Drop the restrictive FK
ALTER TABLE character_roles
  DROP CONSTRAINT IF EXISTS character_roles_character_id_fkey;

-- 2. Cascade-delete trigger function (shared by both source tables)
CREATE OR REPLACE FUNCTION cascade_delete_character_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM character_roles WHERE character_id = OLD.id;
  RETURN OLD;
END;
$$;

-- 3. Trigger on master_ai_characters (preserves original cascade behavior)
DROP TRIGGER IF EXISTS trg_cascade_delete_roles_from_legacy ON master_ai_characters;
CREATE TRIGGER trg_cascade_delete_roles_from_legacy
  AFTER DELETE ON master_ai_characters
  FOR EACH ROW
  EXECUTE FUNCTION cascade_delete_character_roles();

-- 4. Trigger on character_studio_v2 (new — enables V2 cascade)
DROP TRIGGER IF EXISTS trg_cascade_delete_roles_from_v2 ON character_studio_v2;
CREATE TRIGGER trg_cascade_delete_roles_from_v2
  AFTER DELETE ON character_studio_v2
  FOR EACH ROW
  EXECUTE FUNCTION cascade_delete_character_roles();
