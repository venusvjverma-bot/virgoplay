-- Add package_type to engine_package_registry.
-- Distinguishes role packages (MT-001), conversation stage packages (MT-BEG-001),
-- and future modifier packages (AL-xxx, FL-xxx, CP-xxx).

ALTER TABLE engine_package_registry
  ADD COLUMN package_type text NOT NULL DEFAULT 'role'
  CHECK (package_type IN ('role', 'stage', 'modifier'));

COMMENT ON COLUMN engine_package_registry.package_type IS
  'role = top-level role package (e.g. MT-001); '
  'stage = conversation phase package loaded by the Fetch Engine (e.g. MT-BEG-001); '
  'modifier = behaviour modifier applied on top of a stage (e.g. AL-001, FL-001, CP-001)';

-- Backfill existing row
UPDATE engine_package_registry SET package_type = 'role' WHERE code = 'MT-001';

-- ── MT Conversation Stage Packages ───────────────────────────────────────────

INSERT INTO engine_package_registry
  (code, package_group, label, description, trigger_code, trigger_value, parent_code, package_type, sort_order)
VALUES
  (
    'MT-BEG-001',
    'MT',
    'Massage Therapist — Beginning',
    'Conversation stage package covering the period from greeting until the massage session begins. '
    'Handles: greeting, initial consultation, stress discussion, pain discussion, '
    'relaxation discussion, and preparation for session. '
    'Loaded by the Fetch Engine when the MT-001 role is active and the session is in the beginning stage.',
    NULL,
    NULL,
    'MT-001',
    'stage',
    2
  ),
  (
    'MT-MID-001',
    'MT',
    'Massage Therapist — Mid Session',
    'Conversation stage package covering the period from massage start until the final trigger point. '
    'Handles: comfort checks, relaxation progression, guided conversation, emotional connection, '
    'session progression, and the final question before the end-stage package. '
    'Loaded by the Fetch Engine when the MT-001 role is active and the session is in the mid stage.',
    NULL,
    NULL,
    'MT-001',
    'stage',
    3
  );
