-- ── Scenario Architecture Foundation ─────────────────────────────────────────
--
-- Implements the Scenario layer in the platform hierarchy:
--   Role → Scenario → Package → Sequence → Assets
--
-- Design rules enforced:
--   1. BEGIN packages are NOT scenario-owned — they run before scenario selection.
--   2. Scenario selection occurs after the BEGIN package completes.
--   3. Multiple scenarios may share a final package (convergence).
--   4. Existing Role → Package paths continue to work (additive, not destructive).
--   5. Future roles (GF, DF, PE, RP) require only INSERT — no schema change.

-- ── engine_scenario_registry ──────────────────────────────────────────────────

CREATE TABLE engine_scenario_registry (
  code          text        PRIMARY KEY,
  role_code     text        NOT NULL REFERENCES engine_package_registry(code),
  label         text        NOT NULL,
  description   text        NOT NULL DEFAULT '',
  hint          text        NOT NULL DEFAULT '',
  sort_order    integer     NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE engine_scenario_registry IS
  'Major experience paths (scenarios) within a role. '
  'Scenario selection occurs after the BEGIN package completes. '
  'Each scenario routes to one or more packages via engine_scenario_packages. '
  'Multiple scenarios may converge into a shared final package.';

COMMENT ON COLUMN engine_scenario_registry.hint IS
  'Transition dialogue displayed at the end of the last scenario package. '
  'Prepares the user for the next package (e.g. a shared final). '
  'Example: "That was such a great movie. Maybe we should head somewhere quieter."';

ALTER TABLE engine_scenario_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_scenario_registry" ON engine_scenario_registry
  FOR SELECT TO authenticated USING (true);

-- ── engine_scenario_packages (junction) ──────────────────────────────────────
--
-- Many-to-many: scenario ↔ package.
-- Supports convergence — multiple scenarios may share a 'final' package.
-- BEGIN packages are intentionally excluded (pre-scenario, run universally).

CREATE TABLE engine_scenario_packages (
  scenario_code  text        NOT NULL REFERENCES engine_scenario_registry(code) ON DELETE CASCADE,
  package_code   text        NOT NULL REFERENCES engine_package_registry(code),
  package_role   text        NOT NULL DEFAULT 'main'
                             CHECK (package_role IN ('main', 'final')),
  sort_order     integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (scenario_code, package_code)
);

COMMENT ON TABLE engine_scenario_packages IS
  'Links scenarios to the packages they load. '
  'package_role = main  → scenario-specific packages (unique to this scenario). '
  'package_role = final → shared endpoint packages (convergence point, shared across scenarios). '
  'BEGIN packages are excluded — they run before scenario selection.';

ALTER TABLE engine_scenario_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_scenario_packages" ON engine_scenario_packages
  FOR SELECT TO authenticated USING (true);

CREATE INDEX engine_scenario_packages_scenario_idx
  ON engine_scenario_packages (scenario_code, sort_order);

-- ── Seed: MT Scenarios ────────────────────────────────────────────────────────
-- Four major experience paths for the Massage Therapist role.
-- MT-BEG-001 (BEGIN package) is NOT included — it runs before scenario selection.
-- MT-MID-001 is linked as the current main stage for all scenarios.
-- Scenario-specific stage packages will be added in future migrations.

INSERT INTO engine_scenario_registry
  (code, role_code, label, description, hint, sort_order)
VALUES
  (
    'MT-SC-001', 'MT-001',
    'First Visit',
    'The client is experiencing a professional massage session for the first time. '
    'The therapist builds comfort and trust before guiding the client through their first session.',
    'As we come to the end of your session, I hope this has been everything you were hoping for. '
    'I would love to see you again whenever you are ready.',
    1
  ),
  (
    'MT-SC-002', 'MT-001',
    'Stress Relief',
    'The client is carrying significant physical or emotional stress. '
    'The session focuses on releasing tension and helping the client fully decompress.',
    'I can feel how much tension you have been carrying. '
    'I hope you leave today feeling lighter and more at peace.',
    2
  ),
  (
    'MT-SC-003', 'MT-001',
    'Relaxation Session',
    'A deep relaxation and pampering session with a calm, unhurried pace. '
    'The client wants to completely switch off and be taken care of.',
    'What a beautiful, peaceful session this has been. '
    'You deserve every moment of rest you have had today.',
    3
  ),
  (
    'MT-SC-004', 'MT-001',
    'Follow-up Session',
    'The client is returning after a previous session with an existing relationship with the therapist. '
    'The session builds on established trust and familiarity.',
    'It has been so lovely having you back today. '
    'I look forward to seeing you again soon.',
    4
  );

-- Link MT-MID-001 as the current main package for all MT scenarios.
-- Future migrations will add scenario-specific packages (e.g. MT-FIRST-001, MT-STRESS-001).

INSERT INTO engine_scenario_packages (scenario_code, package_code, package_role, sort_order)
VALUES
  ('MT-SC-001', 'MT-MID-001', 'main', 1),
  ('MT-SC-002', 'MT-MID-001', 'main', 1),
  ('MT-SC-003', 'MT-MID-001', 'main', 1),
  ('MT-SC-004', 'MT-MID-001', 'main', 1);
