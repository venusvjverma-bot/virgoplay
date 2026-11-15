/*
 * Architecture Correction — Role Studio inherits Character Studio
 *
 * Role Studio must NOT store its own Generation Configuration.
 * Provider, Tool, Model, Ratio, and Batch Size are inherited from the
 * linked Character's saved_prompt and provider_metadata.
 *
 * A Scene may optionally override individual values (model, ratio, batch_size).
 * Provider and tool are always inherited — they are tied to the character's identity.
 *
 * Changes:
 * 1. Drop gen_provider, gen_tool, gen_model, gen_ratio, gen_batch_size from role_scenarios
 * 2. Drop gen_provider, gen_tool, gen_model, gen_ratio, gen_batch_size from scenario_scenes
 * 3. Add optional override columns to scenario_scenes:
 *    override_gen_model, override_gen_ratio, override_gen_batch_size (nullable)
 */

-- ── role_scenarios: drop gen config columns ──────────────────────────────

ALTER TABLE role_scenarios DROP COLUMN IF EXISTS gen_provider;
ALTER TABLE role_scenarios DROP COLUMN IF EXISTS gen_tool;
ALTER TABLE role_scenarios DROP COLUMN IF EXISTS gen_model;
ALTER TABLE role_scenarios DROP COLUMN IF EXISTS gen_ratio;
ALTER TABLE role_scenarios DROP COLUMN IF EXISTS gen_batch_size;

-- ── scenario_scenes: drop gen config columns ─────────────────────────────

ALTER TABLE scenario_scenes DROP COLUMN IF EXISTS gen_provider;
ALTER TABLE scenario_scenes DROP COLUMN IF EXISTS gen_tool;
ALTER TABLE scenario_scenes DROP COLUMN IF EXISTS gen_model;
ALTER TABLE scenario_scenes DROP COLUMN IF EXISTS gen_ratio;
ALTER TABLE scenario_scenes DROP COLUMN IF EXISTS gen_batch_size;

-- ── scenario_scenes: add optional override columns ──────────────────────
-- NULL means "inherit from character". Non-null means "override this value".

ALTER TABLE scenario_scenes ADD COLUMN IF NOT EXISTS override_gen_model text;
ALTER TABLE scenario_scenes ADD COLUMN IF NOT EXISTS override_gen_ratio text;
ALTER TABLE scenario_scenes ADD COLUMN IF NOT EXISTS override_gen_batch_size integer;
