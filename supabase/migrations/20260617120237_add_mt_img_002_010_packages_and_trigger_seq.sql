-- Add trigger_seq to engine_package_registry for image packages
ALTER TABLE engine_package_registry ADD COLUMN IF NOT EXISTS trigger_seq integer DEFAULT NULL;

-- Update MT-IMG-001 with its trigger_seq
UPDATE engine_package_registry SET trigger_seq = 1 WHERE code = 'MT-IMG-001';

-- Register MT-IMG-002 through MT-IMG-010
INSERT INTO engine_package_registry (code, label, description, package_group, package_type, parent_code, is_active, sort_order, trigger_seq)
VALUES
  ('MT-IMG-002', 'MT Safe Space Image',       'Image displayed at SEQ-2: therapist creating a safe, welcoming atmosphere.',       'MT', 'image', 'MT-BEG-001', true, 2,  2),
  ('MT-IMG-003', 'MT Consultation Image',     'Image displayed at SEQ-3: therapist listening attentively during consultation.',   'MT', 'image', 'MT-BEG-001', true, 3,  3),
  ('MT-IMG-004', 'MT Empathy Image',          'Image displayed at SEQ-4: therapist responding with empathy to stress concerns.',  'MT', 'image', 'MT-BEG-001', true, 4,  4),
  ('MT-IMG-005', 'MT Plan Image',             'Image displayed at SEQ-5: therapist confidently explaining the session plan.',     'MT', 'image', 'MT-BEG-001', true, 5,  5),
  ('MT-IMG-006', 'MT Permission Image',       'Image displayed at SEQ-6: therapist warmly inviting the client to let go.',        'MT', 'image', 'MT-BEG-001', true, 6,  6),
  ('MT-IMG-007', 'MT Pain Care Image',        'Image displayed at SEQ-7: therapist responding gently to pain concerns.',          'MT', 'image', 'MT-BEG-001', true, 7,  7),
  ('MT-IMG-008', 'MT Preparation Image',      'Image displayed at SEQ-8: therapist carefully preparing the treatment space.',     'MT', 'image', 'MT-BEG-001', true, 8,  8),
  ('MT-IMG-009', 'MT Good Hands Image',       'Image displayed at SEQ-9: therapist communicating safety and competence.',         'MT', 'image', 'MT-BEG-001', true, 9,  9),
  ('MT-IMG-010', 'MT Relaxation Space Image', 'Image displayed at SEQ-10: therapist presenting the serene relaxation space.',     'MT', 'image', 'MT-BEG-001', true, 10, 10)
ON CONFLICT (code) DO NOTHING;

-- Add trigger_seq to companion_test_messages so the UI can link messages to image packages
ALTER TABLE companion_test_messages ADD COLUMN IF NOT EXISTS trigger_seq integer DEFAULT NULL;
