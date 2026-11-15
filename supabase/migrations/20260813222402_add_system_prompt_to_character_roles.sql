ALTER TABLE character_roles
  ADD COLUMN IF NOT EXISTS system_prompt text NOT NULL DEFAULT '';
