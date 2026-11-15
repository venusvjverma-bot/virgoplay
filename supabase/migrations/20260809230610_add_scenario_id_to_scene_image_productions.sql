/*
# Add scenario_id column to scene_image_productions

1. Purpose
   Scenario Studio V2 groups scenes under scenarios. The scenario_id column
   records which scenario a scene belongs to, so scenes can be reloaded
   grouped by scenario after a page refresh.

2. Changes
   - ALTER TABLE scene_image_productions ADD COLUMN scenario_id text
     (defaults to 'scenario-1' for backward compat with existing rows).
   - Add an index on (creator_id, role_id, scenario_id) for grouped loads.

3. Security
   No policy changes — the column is covered by the existing owner-scoped
   CRUD policies already on the table.
*/

ALTER TABLE scene_image_productions
  ADD COLUMN IF NOT EXISTS scenario_id text NOT NULL DEFAULT 'scenario-1';

CREATE INDEX IF NOT EXISTS idx_scene_image_productions_creator_role_scenario
  ON scene_image_productions (creator_id, role_id, scenario_id);
