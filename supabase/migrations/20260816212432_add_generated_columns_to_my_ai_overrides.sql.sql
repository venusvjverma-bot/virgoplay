/*
# Add generated image columns to My AI child overrides

Stores the Child Creator's generated My AI image result, separate from
their uploaded identity reference image.

Columns:
  generated_image_url     TEXT   — URL of the generated image
  generated_image_status  TEXT   — '' | 'Processing' | 'Ready' | 'Failed'
  generated_generation_id UUID   — links to generations table for tracking
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2_my_ai_overrides'
      AND column_name = 'generated_image_url') THEN
    ALTER TABLE character_studio_v2_my_ai_overrides ADD COLUMN generated_image_url TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2_my_ai_overrides'
      AND column_name = 'generated_image_status') THEN
    ALTER TABLE character_studio_v2_my_ai_overrides ADD COLUMN generated_image_status TEXT DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2_my_ai_overrides'
      AND column_name = 'generated_generation_id') THEN
    ALTER TABLE character_studio_v2_my_ai_overrides ADD COLUMN generated_generation_id UUID;
  END IF;
END $$;
