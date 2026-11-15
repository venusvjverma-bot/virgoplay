-- Add Wan 3.0 I2V video configuration columns to scene_image_productions.
-- These store the Atlas Cloud Wan 3.0 Image-to-Video specific parameters
-- that are distinct from the existing ZenCreator video config columns.
-- Wan 3.0 I2V fields: video_provider (atlas/zencreator), video_wan_model,
-- video_wan_resolution, video_wan_duration, video_wan_audio, video_wan_last_image_url
ALTER TABLE scene_image_productions
  ADD COLUMN IF NOT EXISTS video_provider text DEFAULT 'zencreator',
  ADD COLUMN IF NOT EXISTS video_wan_model text DEFAULT 'alibaba/wan-3.0/image-to-video',
  ADD COLUMN IF NOT EXISTS video_wan_resolution text DEFAULT '1080P',
  ADD COLUMN IF NOT EXISTS video_wan_duration int DEFAULT 5,
  ADD COLUMN IF NOT EXISTS video_wan_audio boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS video_wan_last_image_url text;