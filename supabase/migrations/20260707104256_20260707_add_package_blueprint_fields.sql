-- Add Package Blueprint generation instruction fields to engine_package_registry.
-- These fields define HOW to generate content for a package — they are generation
-- instructions only and must NOT contain generated dialogue.
-- Applies to package_type = 'stage' rows; other types leave fields at default.

ALTER TABLE engine_package_registry
  ADD COLUMN purpose           text    NOT NULL DEFAULT '',
  ADD COLUMN conversation_goal text    NOT NULL DEFAULT '',
  ADD COLUMN target_outcome    text    NOT NULL DEFAULT '',
  ADD COLUMN dialogue_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN words_per_dialogue integer NOT NULL DEFAULT 0,
  ADD COLUMN must_include      text    NOT NULL DEFAULT '',
  ADD COLUMN must_avoid        text    NOT NULL DEFAULT '';
