-- Allow display-name-only override rows without an image
ALTER TABLE character_studio_v2_my_ai_overrides ALTER COLUMN image_url DROP NOT NULL;