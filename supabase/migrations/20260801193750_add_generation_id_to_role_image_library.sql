-- Add generation_id column to role_image_library
-- This links each role image to its Generation Engine record.
ALTER TABLE role_image_library
  ADD COLUMN IF NOT EXISTS generation_id uuid REFERENCES generations(id) ON DELETE SET NULL;
