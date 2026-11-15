-- Seed Master Dialogue Packages: MT-BEG-002 → MT-BEG-009
-- Canonical beginning-stage packages for the Massage Therapist role.
-- All packages are system-owned (is_system = true, creator_id = NULL).
-- Content is placeholder — to be authored in the Message Editor.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Register MT-BEG-002 → MT-BEG-009 in engine_package_registry
--    Required before dialogue_packages can reference them (FK constraint).
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO engine_package_registry
  (code, package_group, label, description, parent_code, package_type, sort_order)
VALUES
  ('MT-BEG-002', 'MT', 'Massage Therapist — Beginning (2)', 'MT-001 beginning-stage package 2. Placeholder — author in Message Editor.', 'MT-001', 'stage', 2),
  ('MT-BEG-003', 'MT', 'Massage Therapist — Beginning (3)', 'MT-001 beginning-stage package 3. Placeholder — author in Message Editor.', 'MT-001', 'stage', 2),
  ('MT-BEG-004', 'MT', 'Massage Therapist — Beginning (4)', 'MT-001 beginning-stage package 4. Placeholder — author in Message Editor.', 'MT-001', 'stage', 2),
  ('MT-BEG-005', 'MT', 'Massage Therapist — Beginning (5)', 'MT-001 beginning-stage package 5. Placeholder — author in Message Editor.', 'MT-001', 'stage', 2),
  ('MT-BEG-006', 'MT', 'Massage Therapist — Beginning (6)', 'MT-001 beginning-stage package 6. Placeholder — author in Message Editor.', 'MT-001', 'stage', 2),
  ('MT-BEG-007', 'MT', 'Massage Therapist — Beginning (7)', 'MT-001 beginning-stage package 7. Placeholder — author in Message Editor.', 'MT-001', 'stage', 2),
  ('MT-BEG-008', 'MT', 'Massage Therapist — Beginning (8)', 'MT-001 beginning-stage package 8. Placeholder — author in Message Editor.', 'MT-001', 'stage', 2),
  ('MT-BEG-009', 'MT', 'Massage Therapist — Beginning (9)', 'MT-001 beginning-stage package 9. Placeholder — author in Message Editor.', 'MT-001', 'stage', 2)
ON CONFLICT (code) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Seed dialogue_packages
--    ON CONFLICT targets the partial unique index:
--    idx_dlg_pkg_unique_system_code ON dialogue_packages (package_code) WHERE is_system = true
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO dialogue_packages
  (package_code, role_code, stage, sequence, version, status,
   dialogue_text, emotion, camera_angle, scene_context,
   generation_status, generation_metadata, is_system, creator_id)
VALUES
  ('MT-BEG-002', 'MT-001', 'beginning', 2, 1, 'active',
   'Placeholder dialogue for MT-BEG-002. Author this content in the Message Editor before activating this package in the conversation flow.',
   'warm_welcoming', 'medium_shot_level',
   'Placeholder scene context for MT-BEG-002. Treatment room — describe the specific scene, mood, and therapist position here.',
   'generated', '{"role_blueprint":{"role_code":"MT-001"},"generation_type":"system_placeholder","seeded_at":"2026-07-01"}',
   true, null),

  ('MT-BEG-003', 'MT-001', 'beginning', 3, 1, 'active',
   'Placeholder dialogue for MT-BEG-003. Author this content in the Message Editor before activating this package in the conversation flow.',
   'warm_welcoming', 'medium_shot_level',
   'Placeholder scene context for MT-BEG-003. Treatment room — describe the specific scene, mood, and therapist position here.',
   'generated', '{"role_blueprint":{"role_code":"MT-001"},"generation_type":"system_placeholder","seeded_at":"2026-07-01"}',
   true, null),

  ('MT-BEG-004', 'MT-001', 'beginning', 4, 1, 'active',
   'Placeholder dialogue for MT-BEG-004. Author this content in the Message Editor before activating this package in the conversation flow.',
   'warm_welcoming', 'medium_shot_level',
   'Placeholder scene context for MT-BEG-004. Treatment room — describe the specific scene, mood, and therapist position here.',
   'generated', '{"role_blueprint":{"role_code":"MT-001"},"generation_type":"system_placeholder","seeded_at":"2026-07-01"}',
   true, null),

  ('MT-BEG-005', 'MT-001', 'beginning', 5, 1, 'active',
   'Placeholder dialogue for MT-BEG-005. Author this content in the Message Editor before activating this package in the conversation flow.',
   'warm_welcoming', 'medium_shot_level',
   'Placeholder scene context for MT-BEG-005. Treatment room — describe the specific scene, mood, and therapist position here.',
   'generated', '{"role_blueprint":{"role_code":"MT-001"},"generation_type":"system_placeholder","seeded_at":"2026-07-01"}',
   true, null),

  ('MT-BEG-006', 'MT-001', 'beginning', 6, 1, 'active',
   'Placeholder dialogue for MT-BEG-006. Author this content in the Message Editor before activating this package in the conversation flow.',
   'warm_welcoming', 'medium_shot_level',
   'Placeholder scene context for MT-BEG-006. Treatment room — describe the specific scene, mood, and therapist position here.',
   'generated', '{"role_blueprint":{"role_code":"MT-001"},"generation_type":"system_placeholder","seeded_at":"2026-07-01"}',
   true, null),

  ('MT-BEG-007', 'MT-001', 'beginning', 7, 1, 'active',
   'Placeholder dialogue for MT-BEG-007. Author this content in the Message Editor before activating this package in the conversation flow.',
   'warm_welcoming', 'medium_shot_level',
   'Placeholder scene context for MT-BEG-007. Treatment room — describe the specific scene, mood, and therapist position here.',
   'generated', '{"role_blueprint":{"role_code":"MT-001"},"generation_type":"system_placeholder","seeded_at":"2026-07-01"}',
   true, null),

  ('MT-BEG-008', 'MT-001', 'beginning', 8, 1, 'active',
   'Placeholder dialogue for MT-BEG-008. Author this content in the Message Editor before activating this package in the conversation flow.',
   'warm_welcoming', 'medium_shot_level',
   'Placeholder scene context for MT-BEG-008. Treatment room — describe the specific scene, mood, and therapist position here.',
   'generated', '{"role_blueprint":{"role_code":"MT-001"},"generation_type":"system_placeholder","seeded_at":"2026-07-01"}',
   true, null),

  ('MT-BEG-009', 'MT-001', 'beginning', 9, 1, 'active',
   'Placeholder dialogue for MT-BEG-009. Author this content in the Message Editor before activating this package in the conversation flow.',
   'warm_welcoming', 'medium_shot_level',
   'Placeholder scene context for MT-BEG-009. Treatment room — describe the specific scene, mood, and therapist position here.',
   'generated', '{"role_blueprint":{"role_code":"MT-001"},"generation_type":"system_placeholder","seeded_at":"2026-07-01"}',
   true, null)

ON CONFLICT (package_code) WHERE is_system = true DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Seed dialogue_package_assets — one placeholder image per package.
--    Image codes cycle across the 3 beginning-phase slots (IMG-001–003).
--    Reassign when authoring final content.
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO dialogue_package_assets
  (package_id, package_code, asset_type, asset_code, is_primary, sort_order)
SELECT dp.id, 'MT-BEG-002', 'image', 'MT-IMG-002', true, 1
  FROM dialogue_packages dp WHERE dp.package_code = 'MT-BEG-002'
ON CONFLICT (package_id, asset_type, asset_code) DO NOTHING;

INSERT INTO dialogue_package_assets
  (package_id, package_code, asset_type, asset_code, is_primary, sort_order)
SELECT dp.id, 'MT-BEG-003', 'image', 'MT-IMG-003', true, 1
  FROM dialogue_packages dp WHERE dp.package_code = 'MT-BEG-003'
ON CONFLICT (package_id, asset_type, asset_code) DO NOTHING;

INSERT INTO dialogue_package_assets
  (package_id, package_code, asset_type, asset_code, is_primary, sort_order)
SELECT dp.id, 'MT-BEG-004', 'image', 'MT-IMG-001', true, 1
  FROM dialogue_packages dp WHERE dp.package_code = 'MT-BEG-004'
ON CONFLICT (package_id, asset_type, asset_code) DO NOTHING;

INSERT INTO dialogue_package_assets
  (package_id, package_code, asset_type, asset_code, is_primary, sort_order)
SELECT dp.id, 'MT-BEG-005', 'image', 'MT-IMG-002', true, 1
  FROM dialogue_packages dp WHERE dp.package_code = 'MT-BEG-005'
ON CONFLICT (package_id, asset_type, asset_code) DO NOTHING;

INSERT INTO dialogue_package_assets
  (package_id, package_code, asset_type, asset_code, is_primary, sort_order)
SELECT dp.id, 'MT-BEG-006', 'image', 'MT-IMG-003', true, 1
  FROM dialogue_packages dp WHERE dp.package_code = 'MT-BEG-006'
ON CONFLICT (package_id, asset_type, asset_code) DO NOTHING;

INSERT INTO dialogue_package_assets
  (package_id, package_code, asset_type, asset_code, is_primary, sort_order)
SELECT dp.id, 'MT-BEG-007', 'image', 'MT-IMG-001', true, 1
  FROM dialogue_packages dp WHERE dp.package_code = 'MT-BEG-007'
ON CONFLICT (package_id, asset_type, asset_code) DO NOTHING;

INSERT INTO dialogue_package_assets
  (package_id, package_code, asset_type, asset_code, is_primary, sort_order)
SELECT dp.id, 'MT-BEG-008', 'image', 'MT-IMG-002', true, 1
  FROM dialogue_packages dp WHERE dp.package_code = 'MT-BEG-008'
ON CONFLICT (package_id, asset_type, asset_code) DO NOTHING;

INSERT INTO dialogue_package_assets
  (package_id, package_code, asset_type, asset_code, is_primary, sort_order)
SELECT dp.id, 'MT-BEG-009', 'image', 'MT-IMG-003', true, 1
  FROM dialogue_packages dp WHERE dp.package_code = 'MT-BEG-009'
ON CONFLICT (package_id, asset_type, asset_code) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Seed dialogue_package_responses — 3 placeholder responses per package.
--    next_package_code = NULL until routing is authored in the Message Editor.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  pkg_codes text[] := ARRAY[
    'MT-BEG-002','MT-BEG-003','MT-BEG-004','MT-BEG-005',
    'MT-BEG-006','MT-BEG-007','MT-BEG-008','MT-BEG-009'
  ];
  pkg_code  text;
  pkg_id    uuid;
BEGIN
  FOREACH pkg_code IN ARRAY pkg_codes LOOP
    SELECT id INTO pkg_id FROM dialogue_packages WHERE package_code = pkg_code;
    IF pkg_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO dialogue_package_responses
      (package_id, package_code, sort_order, display_text, internal_intent, next_package_code)
    VALUES
      (pkg_id, pkg_code, 1, 'I''d like to continue.',    'placeholder_continue',    NULL),
      (pkg_id, pkg_code, 2, 'Tell me more.',              'placeholder_tell_more',   NULL),
      (pkg_id, pkg_code, 3, 'I understand, thank you.',  'placeholder_acknowledge', NULL)
    ON CONFLICT (package_id, sort_order) DO NOTHING;
  END LOOP;
END $$;
