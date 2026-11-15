-- Add display_name to My AI child overrides
-- Allows Child Creators to set a custom client-facing name for their shared My AI character.
-- The backend character_studio_v2.name stays unchanged; this is a display-only override.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2_my_ai_overrides'
      AND column_name = 'display_name') THEN
    ALTER TABLE character_studio_v2_my_ai_overrides ADD COLUMN display_name TEXT;
  END IF;
END $$;
