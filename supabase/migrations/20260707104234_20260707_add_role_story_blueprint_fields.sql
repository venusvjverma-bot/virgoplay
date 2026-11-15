-- Add Role Blueprint and Story Blueprint fields to engine_role_definitions.
-- target_audience and generation_type define role-level generation context.
-- story_name, story_goal, current_story define the Story Blueprint layer.

ALTER TABLE engine_role_definitions
  ADD COLUMN target_audience  text NOT NULL DEFAULT '',
  ADD COLUMN generation_type  text NOT NULL DEFAULT '',
  ADD COLUMN story_name       text NOT NULL DEFAULT '',
  ADD COLUMN story_goal       text NOT NULL DEFAULT '',
  ADD COLUMN current_story    text NOT NULL DEFAULT '';
