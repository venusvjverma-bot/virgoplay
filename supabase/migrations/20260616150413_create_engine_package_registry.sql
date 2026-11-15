-- engine_package_registry
-- Stores all role and behaviour packages used by the Decision Engine and Fetch Engine.
-- Packages are loaded based on segment code values from the Character Blueprint Snapshot.
-- Package codes are permanent and must never be changed or reused.

CREATE TABLE engine_package_registry (
  code            text        PRIMARY KEY,
  package_group   text        NOT NULL,
  label           text        NOT NULL,
  description     text,
  -- Trigger: the segment code and value that cause this package to load
  trigger_code    text        REFERENCES companion_segment_registry(code),
  trigger_value   text,
  -- Hierarchy: packages can have a parent (e.g. dialogue libraries under MT-001)
  parent_code     text        REFERENCES engine_package_registry(code),
  is_active       boolean     NOT NULL DEFAULT true,
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE engine_package_registry IS
  'Role and behaviour packages loaded by the Decision Engine and Fetch Engine. '
  'trigger_code + trigger_value define the blueprint condition that activates a package. '
  'parent_code enables package hierarchies (e.g. dialogue libraries parented to a role package).';

COMMENT ON COLUMN engine_package_registry.trigger_code  IS 'Segment code that drives package selection (e.g. RS001)';
COMMENT ON COLUMN engine_package_registry.trigger_value IS 'Segment value that activates this package (e.g. ''Massage Therapist'')';
COMMENT ON COLUMN engine_package_registry.parent_code   IS 'Parent package code — null for top-level packages';

ALTER TABLE engine_package_registry ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users; only service role can mutate
CREATE POLICY "read_package_registry" ON engine_package_registry
  FOR SELECT TO authenticated USING (true);

-- ── Seed: MT group ────────────────────────────────────────────────────────────

INSERT INTO engine_package_registry
  (code, package_group, label, description, trigger_code, trigger_value, parent_code, sort_order)
VALUES
  (
    'MT-001',
    'MT',
    'Massage Therapist',
    'Primary role package for massage therapist conversations. '
    'Loaded by the Decision Engine and Fetch Engine when RS001 = ''Massage Therapist''. '
    'Parent package for all Massage Therapist dialogue libraries and future role-specific content.',
    'RS001',
    'Massage Therapist',
    NULL,
    1
  );
