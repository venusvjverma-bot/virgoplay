/*
 * Add prompt_overrides JSONB column to scenario_scenes
 *
 * A scene can override specific Universal Prompt Schema fields from the
 * linked character. The overrides are stored as a JSONB object with the
 * same keys as UniversalPromptSchema (e.g. { "clothing": "red dress",
 * "pose": "standing", "environment": "bedroom" }).
 *
 * NULL means "inherit all fields from the character's prompt schema".
 * An empty object {} means "no overrides" (same as NULL).
 * Non-empty keys override the corresponding character schema fields.
 *
 * This allows Role Studio to reuse the same Universal Prompt Schema
 * component — the scene simply preloads the character's schema and
 * applies overrides on top.
 */

ALTER TABLE scenario_scenes ADD COLUMN IF NOT EXISTS prompt_overrides jsonb DEFAULT NULL;

COMMENT ON COLUMN scenario_scenes.prompt_overrides IS
  'JSONB object with Universal Prompt Schema field overrides. NULL = inherit all from character. Keys match UniversalPromptSchema field names.';
