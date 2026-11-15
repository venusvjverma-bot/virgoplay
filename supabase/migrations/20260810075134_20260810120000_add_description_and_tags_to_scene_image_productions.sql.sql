ALTER TABLE scene_image_productions
  ADD COLUMN IF NOT EXISTS description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags text DEFAULT '';