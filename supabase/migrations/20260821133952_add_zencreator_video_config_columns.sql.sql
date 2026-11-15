-- Add ZenCreator videogen configuration columns to scene_image_productions.
-- These persist the Mother Creator's video generation settings per scene so
-- Child Creators can reuse them.
ALTER TABLE scene_image_productions
  ADD COLUMN IF NOT EXISTS video_model text DEFAULT 'wan@2.2',
  ADD COLUMN IF NOT EXISTS video_duration int DEFAULT 5,
  ADD COLUMN IF NOT EXISTS video_resolution text DEFAULT '720p',
  ADD COLUMN IF NOT EXISTS video_generate_audio boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS video_camera_fixed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_prompt_extend boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_negative_prompt text DEFAULT '',
  ADD COLUMN IF NOT EXISTS video_ref_asset_id text,
  ADD COLUMN IF NOT EXISTS video_last_frame_asset_id text;