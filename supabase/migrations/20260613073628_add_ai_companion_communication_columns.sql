ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS ai_comm_conversation_pace      text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_comm_initiative_level       integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS ai_comm_response_length        text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_comm_engagement_style       text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_comm_story_guidance         text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_comm_consistency            integer NOT NULL DEFAULT 3;
