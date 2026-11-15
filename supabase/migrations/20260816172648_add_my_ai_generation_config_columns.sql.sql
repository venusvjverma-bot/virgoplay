/*
# Add My AI Generation Configuration columns to character_studio_v2

Stores the Mother Creator's generation config for the reserved "My AI" V-card.
Only the My AI row (is_my_ai = true) uses these columns; all other character
rows leave them null. This is additive only — no existing columns are changed.

Columns:
  my_ai_prompt           text   — editable prompt text (mirrors role_prompt)
  my_ai_gen_model        text   — model selection (mirrors gen_model)
  my_ai_gen_ratio        text   — aspect ratio (mirrors gen_ratio)
  my_ai_gen_num_images   integer — number of images (mirrors gen_number_of_images)
  my_ai_image_url        text   — generated preview image URL
  my_ai_image_asset_id   text   — generated image asset ID
  my_ai_image_status     text   — '' | 'Processing' | 'Ready' | 'Failed'

Security: no RLS changes — existing owner-scoped policies cover the new columns.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2' AND column_name = 'my_ai_prompt') THEN
    ALTER TABLE character_studio_v2 ADD COLUMN my_ai_prompt text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2' AND column_name = 'my_ai_gen_model') THEN
    ALTER TABLE character_studio_v2 ADD COLUMN my_ai_gen_model text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2' AND column_name = 'my_ai_gen_ratio') THEN
    ALTER TABLE character_studio_v2 ADD COLUMN my_ai_gen_ratio text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2' AND column_name = 'my_ai_gen_num_images') THEN
    ALTER TABLE character_studio_v2 ADD COLUMN my_ai_gen_num_images integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2' AND column_name = 'my_ai_image_url') THEN
    ALTER TABLE character_studio_v2 ADD COLUMN my_ai_image_url text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2' AND column_name = 'my_ai_image_asset_id') THEN
    ALTER TABLE character_studio_v2 ADD COLUMN my_ai_image_asset_id text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_studio_v2' AND column_name = 'my_ai_image_status') THEN
    ALTER TABLE character_studio_v2 ADD COLUMN my_ai_image_status text;
  END IF;
END $$;
