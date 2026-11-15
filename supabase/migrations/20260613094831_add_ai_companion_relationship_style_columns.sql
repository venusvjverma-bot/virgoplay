ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS ai_rel_dynamic         text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_rel_attachment       text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_rel_affection_level  integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS ai_rel_description      text    NOT NULL DEFAULT '';
