-- Add Scenario Blueprint context fields to engine_scenario_registry.
-- scene describes the physical/narrative setting.
-- current_relationship describes the AI-client relationship state entering this scenario.
-- scenario_goal is the explicit objective for this scenario.
-- Note: existing hint column already serves as Expected Ending.

ALTER TABLE engine_scenario_registry
  ADD COLUMN scene                text NOT NULL DEFAULT '',
  ADD COLUMN current_relationship text NOT NULL DEFAULT '',
  ADD COLUMN scenario_goal        text NOT NULL DEFAULT '';
