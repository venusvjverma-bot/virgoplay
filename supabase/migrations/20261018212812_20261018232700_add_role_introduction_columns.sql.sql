/*
# Add Role Introduction columns to character_roles

1. Summary
- Adds a reusable "Role Introduction" (the welcome title and text shown on the
  public Test Chat welcome screen) as saved data on each role, so the Mother
  account can write and edit it from Role Studio instead of needing code changes.
- Previously this text was hardcoded in the application for specific role IDs.

2. Modified Tables
- `character_roles`
  - `introduction_title` (text, nullable, no default): heading shown on the
    Test Chat welcome screen.
  - `introduction_body` (text, nullable, no default): welcome paragraph shown
    before the visitor sends their first message.
- No existing columns, rows, or values are changed. Both new columns are
  nullable with no default, so every existing role is unaffected.

3. Security
- No policy changes. `character_roles` already has owner-scoped RLS
  (select/insert/update/delete policies checking `auth.uid() = creator_id`),
  which remains the only write path for the new columns. Anonymous visitors
  keep exactly the read access they already have and gain no write access.
- No new tables, RPCs, or services.

4. Notes
- Idempotent: columns are added conditionally.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'character_roles'
      AND column_name = 'introduction_title'
  ) THEN
    ALTER TABLE public.character_roles ADD COLUMN introduction_title text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'character_roles'
      AND column_name = 'introduction_body'
  ) THEN
    ALTER TABLE public.character_roles ADD COLUMN introduction_body text;
  END IF;
END $$;
