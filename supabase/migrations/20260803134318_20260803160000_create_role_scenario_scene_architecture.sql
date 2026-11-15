/*
# Role → Scenario → Scene Architecture

1. Purpose
   - Extends the existing Character Identity pipeline with a structured
     Role → Scenario → Scene hierarchy.
   - Character Identity (face, hair, body, reference image) remains immutable.
   - Scenes contain structured fields only (no free-text descriptions).
   - Each Scene / Scenario carries editable generation config
     (provider, tool, model, ratio, batch_size) — no hardcoding.
   - The Scene Prompt Builder combines Character Identity + Scene fields
     into the final prompt fed to the existing generation pipeline.

2. New Tables
   - character_roles          — one role per character (e.g. "Massage Girl")
   - role_scenarios           — ordered scenarios within a role
   - scenario_scenes          — structured scenes within a scenario

3. Relationships
   - character_roles.character_id  → master_ai_characters(id)  ON DELETE CASCADE
   - role_scenarios.role_id       → character_roles(id)       ON DELETE CASCADE
   - scenario_scenes.scenario_id  → role_scenarios(id)        ON DELETE CASCADE

4. Security
   - RLS enabled on all three tables.
   - 4 owner-scoped CRUD policies each (SELECT/INSERT/UPDATE/DELETE).
   - All scoped TO authenticated with auth.uid() = creator_id.
*/

-- ── character_roles ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS character_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id  uuid NOT NULL REFERENCES master_ai_characters(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  role_image_url text,
  role_image_path text,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE character_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_roles" ON character_roles FOR SELECT
  TO authenticated USING (auth.uid() = creator_id);
CREATE POLICY "insert_own_roles" ON character_roles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "update_own_roles" ON character_roles FOR UPDATE
  TO authenticated USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "delete_own_roles" ON character_roles FOR DELETE
  TO authenticated USING (auth.uid() = creator_id);

-- ── role_scenarios ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS role_scenarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id       uuid NOT NULL REFERENCES character_roles(id) ON DELETE CASCADE,
  name          text NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  -- Optional locked defaults (scenes may override)
  default_clothing    text NOT NULL DEFAULT '',
  default_environment text NOT NULL DEFAULT '',
  default_lighting    text NOT NULL DEFAULT '',
  default_atmosphere  text NOT NULL DEFAULT '',
  -- Editable generation config
  gen_provider  text NOT NULL DEFAULT '',
  gen_tool      text NOT NULL DEFAULT '',
  gen_model     text NOT NULL DEFAULT '',
  gen_ratio     text NOT NULL DEFAULT '',
  gen_batch_size integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE role_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_scenarios" ON role_scenarios FOR SELECT
  TO authenticated USING (auth.uid() = creator_id);
CREATE POLICY "insert_own_scenarios" ON role_scenarios FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "update_own_scenarios" ON role_scenarios FOR UPDATE
  TO authenticated USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "delete_own_scenarios" ON role_scenarios FOR DELETE
  TO authenticated USING (auth.uid() = creator_id);

-- ── scenario_scenes ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scenario_scenes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario_id   uuid NOT NULL REFERENCES role_scenarios(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT '',
  sort_order    integer NOT NULL DEFAULT 0,
  -- Structured scene fields only — no free-text descriptions
  face_lock       boolean NOT NULL DEFAULT true,
  clothing        text NOT NULL DEFAULT '',
  pose            text NOT NULL DEFAULT '',
  expression      text NOT NULL DEFAULT '',
  action          text NOT NULL DEFAULT '',
  partner         text NOT NULL DEFAULT '',
  camera_angle    text NOT NULL DEFAULT '',
  environment     text NOT NULL DEFAULT '',
  lighting        text NOT NULL DEFAULT '',
  atmosphere      text NOT NULL DEFAULT '',
  extra_details   text NOT NULL DEFAULT '',
  -- Editable generation config (overrides scenario defaults when non-empty)
  gen_provider    text NOT NULL DEFAULT '',
  gen_tool        text NOT NULL DEFAULT '',
  gen_model       text NOT NULL DEFAULT '',
  gen_ratio       text NOT NULL DEFAULT '',
  gen_batch_size   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scenario_scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_scenes" ON scenario_scenes FOR SELECT
  TO authenticated USING (auth.uid() = creator_id);
CREATE POLICY "insert_own_scenes" ON scenario_scenes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "update_own_scenes" ON scenario_scenes FOR UPDATE
  TO authenticated USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "delete_own_scenes" ON scenario_scenes FOR DELETE
  TO authenticated USING (auth.uid() = creator_id);

-- ── Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_character_roles_creator    ON character_roles(creator_id);
CREATE INDEX IF NOT EXISTS idx_character_roles_character   ON character_roles(character_id);
CREATE INDEX IF NOT EXISTS idx_role_scenarios_creator      ON role_scenarios(creator_id);
CREATE INDEX IF NOT EXISTS idx_role_scenarios_role         ON role_scenarios(role_id);
CREATE INDEX IF NOT EXISTS idx_scenario_scenes_creator     ON scenario_scenes(creator_id);
CREATE INDEX IF NOT EXISTS idx_scenario_scenes_scenario   ON scenario_scenes(scenario_id);

-- ── updated_at triggers ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_character_roles_updated   BEFORE UPDATE ON character_roles   FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_role_scenarios_updated    BEFORE UPDATE ON role_scenarios    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_scenario_scenes_updated   BEFORE UPDATE ON scenario_scenes   FOR EACH ROW EXECUTE FUNCTION touch_updated_at();