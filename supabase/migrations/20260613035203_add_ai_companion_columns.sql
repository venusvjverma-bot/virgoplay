ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS ai_companion_name   text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_companion_gender text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_companion_age    integer NOT NULL DEFAULT 25;
