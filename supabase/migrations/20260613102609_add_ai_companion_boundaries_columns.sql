ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS ai_bp_media_permissions      text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_bp_relationship_escalation text   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_bp_creator_instructions   text    NOT NULL DEFAULT '';
