ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS ai_companion_personality_type      text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_companion_personality_intensity integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS ai_companion_emotional_style       text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_companion_flirting_style        integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS ai_companion_personality_desc      text    NOT NULL DEFAULT '';
