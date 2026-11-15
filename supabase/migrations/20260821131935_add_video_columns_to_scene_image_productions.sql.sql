-- Add video generation columns to scene_image_productions
ALTER TABLE scene_image_productions
  ADD COLUMN IF NOT EXISTS video_prompt text DEFAULT '',
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS video_asset_id text,
  ADD COLUMN IF NOT EXISTS video_status text DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS video_generation_id uuid;