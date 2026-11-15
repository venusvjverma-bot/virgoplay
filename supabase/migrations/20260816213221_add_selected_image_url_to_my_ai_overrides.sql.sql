/*
# Add selected_image_url to My AI child overrides

Tracks the Child Creator's "active" My AI identity image — the image
they selected from a generated candidate. When selected_image_url is set,
the My AI card is in the "selected" state (Delete ON, everything else OFF).
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2_my_ai_overrides'
      AND column_name = 'selected_image_url') THEN
    ALTER TABLE character_studio_v2_my_ai_overrides ADD COLUMN selected_image_url TEXT;
  END IF;
END $$;
