-- ═══════════════════════════════════════════════════════════════════════════════
-- DIALOGUE BRANCHING — Phase 1: Three dialogue variants per package
--
-- Each package from MT-BEG-002 onward owns three independent Sofia dialogue
-- texts (A, B, C). MT-BEG-001 (the opening) is untouched and continues to use
-- the existing dialogue_text column.
--
-- Dialogue codes are deterministic: package_code || variant suffix.
--   MT-BEG-002A  /  MT-BEG-002B  /  MT-BEG-002C
--   MT-BEG-003A  /  MT-BEG-003B  /  MT-BEG-003C
--   ...
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE dialogue_packages
  ADD COLUMN dialogue_text_a text NOT NULL DEFAULT '',
  ADD COLUMN dialogue_text_b text NOT NULL DEFAULT '',
  ADD COLUMN dialogue_text_c text NOT NULL DEFAULT '';

COMMENT ON COLUMN dialogue_packages.dialogue_text_a IS
  'Branch A Sofia dialogue. Dialogue code = package_code || ''A'' (e.g. MT-BEG-002A). '
  'Active for sequence >= 2 packages. Linked to client response 1.';

COMMENT ON COLUMN dialogue_packages.dialogue_text_b IS
  'Branch B Sofia dialogue. Dialogue code = package_code || ''B'' (e.g. MT-BEG-002B). '
  'Active for sequence >= 2 packages. Linked to client response 2.';

COMMENT ON COLUMN dialogue_packages.dialogue_text_c IS
  'Branch C Sofia dialogue. Dialogue code = package_code || ''C'' (e.g. MT-BEG-002C). '
  'Active for sequence >= 2 packages. Linked to client response 3.';

-- Seed placeholder dialogue variants for MT-BEG-002 → MT-BEG-009.
-- MT-BEG-001 is intentionally excluded — its single dialogue_text is unchanged.
UPDATE dialogue_packages
SET
  dialogue_text_a = 'Placeholder dialogue ' || package_code || 'A. Author this content in the Message Editor before activating.',
  dialogue_text_b = 'Placeholder dialogue ' || package_code || 'B. Author this content in the Message Editor before activating.',
  dialogue_text_c = 'Placeholder dialogue ' || package_code || 'C. Author this content in the Message Editor before activating.'
WHERE package_code IN (
  'MT-BEG-002', 'MT-BEG-003', 'MT-BEG-004', 'MT-BEG-005',
  'MT-BEG-006', 'MT-BEG-007', 'MT-BEG-008', 'MT-BEG-009'
);
