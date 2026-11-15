-- Add Hugging Face generation parameters to scene_image_productions
-- These mirror the HF params already used in the Role Image Production flow.
-- All columns are nullable so existing rows and ZenCreator-only creators are unaffected.

ALTER TABLE scene_image_productions
  ADD COLUMN IF NOT EXISTS lora_adapter TEXT,
  ADD COLUMN IF NOT EXISTS seed INTEGER,
  ADD COLUMN IF NOT EXISTS randomize_seed BOOLEAN,
  ADD COLUMN IF NOT EXISTS guidance_scale DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS steps INTEGER;
