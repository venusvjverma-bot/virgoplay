-- ── Scenario Branch Registry ────────────────────────────────────────────────
-- Adds explicit DAG edges between scenarios for the hierarchical Scenario Library UI.
-- Branching is ultimately driven by dialogue_package_responses routing;
-- this table surfaces it explicitly so the UI can render the tree without
-- complex joins against every response record.

-- Add updated_at to scenario registry for "Last Updated" display
ALTER TABLE engine_scenario_registry
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN engine_scenario_registry.updated_at IS
  'Timestamp of the last modification to this scenario record.';

-- ── engine_scenario_branches ─────────────────────────────────────────────────
--
-- Directed edges in the scenario graph.
-- from_scenario_code → to_scenario_code with an optional human-readable label
-- describing the choice or transition (e.g. "Continue Conversation").
--
-- Supports:
--   One-to-many: one scenario can branch to multiple children.
--   Many-to-one: multiple scenarios can converge into a shared follow-up.

CREATE TABLE engine_scenario_branches (
  from_scenario_code  text     NOT NULL REFERENCES engine_scenario_registry(code) ON DELETE CASCADE,
  to_scenario_code    text     NOT NULL REFERENCES engine_scenario_registry(code) ON DELETE CASCADE,
  label               text,
  sort_order          integer  NOT NULL DEFAULT 0,
  PRIMARY KEY (from_scenario_code, to_scenario_code)
);

COMMENT ON TABLE engine_scenario_branches IS
  'Directed edges in the scenario graph. '
  'from_scenario_code branches into to_scenario_code when the player reaches the scenario transition. '
  'label is the human-readable name of the choice or transition path. '
  'Supports convergence: multiple from_scenario_codes may point to the same to_scenario_code (shared follow-up).';

ALTER TABLE engine_scenario_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_scenario_branches" ON engine_scenario_branches
  FOR SELECT TO authenticated USING (true);

CREATE INDEX engine_scenario_branches_from_idx ON engine_scenario_branches (from_scenario_code, sort_order);
CREATE INDEX engine_scenario_branches_to_idx   ON engine_scenario_branches (to_scenario_code);

-- ── Seed: MT-SC-001 branches ──────────────────────────────────────────────────
-- MT-SC-001 (First Visit) is the entry scenario.
-- Three outgoing branches represent the paths a player can take after the first session.

INSERT INTO engine_scenario_branches (from_scenario_code, to_scenario_code, label, sort_order)
VALUES
  ('MT-SC-001', 'MT-SC-002', 'Continue Conversation', 1),
  ('MT-SC-001', 'MT-SC-003', 'Massage Session',        2),
  ('MT-SC-001', 'MT-SC-004', 'Tea & Relaxation',       3)
ON CONFLICT DO NOTHING;
