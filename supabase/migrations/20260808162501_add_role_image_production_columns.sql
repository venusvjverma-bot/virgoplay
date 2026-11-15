/*
# Add Role Image Production columns to character_roles

1. Purpose
   Enables the Role Studio "Role Image Production" block for Mother Creators.
   Stores the editable prompt, generation config, and generated image metadata
   directly on each role row so existing roles are never changed when the
   Selected V2 character changes — each role keeps its own linked character
   and its own production data.

2. New columns on character_roles
   - role_prompt             text     — editable prompt text (clothing, environment, mood, face-lock style)
   - gen_tool                text     — generation tool, default 'image_editor'
   - gen_model               text     — model selection (e.g. FLUX_KLEIN_NSFW)
   - gen_ratio               text     — aspect ratio (e.g. 9:16)
   - gen_number_of_images    integer  — number of images to generate, default 1
   - role_image_asset_id     text     — generated image asset ID from provider
   - role_image_generation_id text    — generation record ID (generations table)
   - role_image_status       text     — '' | 'Processing' | 'Ready' | 'Failed'

   Existing columns role_image_url and role_image_path are reused for the
   generated image URL and storage path.

3. Security
   No changes to RLS — character_roles already has owner-scoped CRUD policies.
   The new columns are covered by the existing policies.

4. Notes
   - No data is lost: all new columns are additive with safe defaults.
   - Existing roles get empty prompt, default tool 'image_editor', default
     model 'FLUX_KLEIN_NSFW', default ratio '9:16', default 1 image, and
     empty status — they are ready for production but unchanged.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_roles' AND column_name = 'role_prompt') THEN
    ALTER TABLE character_roles ADD COLUMN role_prompt text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_roles' AND column_name = 'gen_tool') THEN
    ALTER TABLE character_roles ADD COLUMN gen_tool text NOT NULL DEFAULT 'image_editor';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_roles' AND column_name = 'gen_model') THEN
    ALTER TABLE character_roles ADD COLUMN gen_model text NOT NULL DEFAULT 'FLUX_KLEIN_NSFW';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_roles' AND column_name = 'gen_ratio') THEN
    ALTER TABLE character_roles ADD COLUMN gen_ratio text NOT NULL DEFAULT '9:16';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_roles' AND column_name = 'gen_number_of_images') THEN
    ALTER TABLE character_roles ADD COLUMN gen_number_of_images integer NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_roles' AND column_name = 'role_image_asset_id') THEN
    ALTER TABLE character_roles ADD COLUMN role_image_asset_id text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_roles' AND column_name = 'role_image_generation_id') THEN
    ALTER TABLE character_roles ADD COLUMN role_image_generation_id text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'character_roles' AND column_name = 'role_image_status') THEN
    ALTER TABLE character_roles ADD COLUMN role_image_status text NOT NULL DEFAULT '';
  END IF;
END $$;
