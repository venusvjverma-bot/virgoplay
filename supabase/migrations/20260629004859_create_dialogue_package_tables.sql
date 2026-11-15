-- ═══════════════════════════════════════════════════════════════════════════════
-- DIALOGUE PACKAGE TABLES — Phase 1: Library schema + MT seed data
--
-- Four new tables:
--   asset_type_registry       — open registry of media asset types
--   dialogue_packages         — canonical generated dialogue content
--   dialogue_package_assets   — asset code bindings (no URLs, no provider info)
--   dialogue_package_responses — 3 client response options per package
--
-- Runtime engine (engine_dialogue_records, companion-chat) is untouched.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. asset_type_registry ────────────────────────────────────────────────────
-- Adding a new media type requires only an INSERT row here.
-- No schema migration needed for future types.

CREATE TABLE asset_type_registry (
  code          text        PRIMARY KEY,
  label         text        NOT NULL,
  description   text,
  library_table text,
  code_prefix   text,
  sort_order    int         NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE asset_type_registry IS
  'Registry of all supported media asset types. Add new types as INSERT rows — '
  'no schema migration needed. library_table: resolution table for this type. '
  'code_prefix: expected asset code prefix (e.g. IMG for MT-IMG-001).';

ALTER TABLE asset_type_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_asset_type_registry" ON asset_type_registry
  FOR SELECT TO authenticated USING (true);

INSERT INTO asset_type_registry
  (code, label, description, library_table, code_prefix, sort_order)
VALUES
  ('image',         'Image',         'Still image asset',                   'role_image_library', 'IMG',   1),
  ('voice',         'Voice',         'Voice/speech audio asset',            'voice_library',      'VOICE', 2),
  ('video',         'Video',         'Video asset',                         'video_library',      'VID',   3),
  ('animation',     'Animation',     'Looping or scripted animation asset', 'animation_library',  'ANIM',  4),
  ('expression',    'Expression',    'Facial expression overlay asset',     'expression_library', 'EXP',   5),
  ('motion',        'Motion',        'Body motion/pose asset',              'motion_library',     'MOT',   6),
  ('ambient_audio', 'Ambient Audio', 'Background/ambient audio asset',      'audio_library',      'AUD',   7);


-- ── 2. dialogue_packages ──────────────────────────────────────────────────────
-- Canonical repository of generated dialogue packages.
-- package_code FKs to engine_package_registry — stage codes ARE package codes.
-- No media URLs. No provider references. Blueprint provenance in
-- generation_metadata only.

CREATE TABLE dialogue_packages (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  package_code         text        NOT NULL UNIQUE
                                     REFERENCES engine_package_registry(code),
  role_code            text        NOT NULL,
  stage                text        NOT NULL
                                     CHECK (stage IN ('beginning','middle','ending')),
  sequence             int         NOT NULL CHECK (sequence >= 1),
  version              int         NOT NULL DEFAULT 1 CHECK (version >= 1),
  status               text        NOT NULL DEFAULT 'draft'
                                     CHECK (status IN ('draft','active','archived')),
  dialogue_text        text        NOT NULL DEFAULT '',
  emotion              text        NOT NULL DEFAULT '',
  camera_angle         text        NOT NULL DEFAULT '',
  scene_context        text        NOT NULL DEFAULT '',
  generation_status    text        NOT NULL DEFAULT 'pending'
                                     CHECK (generation_status IN
                                       ('pending','generating','generated','failed')),
  generation_error     text,
  generation_metadata  jsonb       NOT NULL DEFAULT '{}',
  is_system            boolean     NOT NULL DEFAULT true,
  creator_id           uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE dialogue_packages IS
  'Canonical repository of generated dialogue packages. package_code FKs to '
  'engine_package_registry — stage codes ARE package codes. No media URLs or '
  'provider references. Blueprint provenance in generation_metadata only.';

CREATE INDEX idx_dlg_pkg_role_stage    ON dialogue_packages (role_code, stage, sequence);
CREATE INDEX idx_dlg_pkg_active_status ON dialogue_packages (status) WHERE status = 'active';

ALTER TABLE dialogue_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dlg_pkg_read_system" ON dialogue_packages
  FOR SELECT TO authenticated USING (is_system = true);

CREATE POLICY "dlg_pkg_read_own" ON dialogue_packages
  FOR SELECT TO authenticated USING (creator_id = auth.uid());

CREATE POLICY "dlg_pkg_insert_own" ON dialogue_packages
  FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());

CREATE POLICY "dlg_pkg_update_own" ON dialogue_packages
  FOR UPDATE TO authenticated
  USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());


-- ── 3. dialogue_package_assets ────────────────────────────────────────────────
-- Maps canonical asset codes to dialogue packages. Nothing else.
-- asset_type FKs to asset_type_registry — new types require only an INSERT there.
-- No URLs. No generation status. No provider metadata.

CREATE TABLE dialogue_package_assets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id   uuid        NOT NULL
                             REFERENCES dialogue_packages(id) ON DELETE CASCADE,
  package_code text        NOT NULL,
  asset_type   text        NOT NULL REFERENCES asset_type_registry(code),
  asset_code   text        NOT NULL,
  is_primary   boolean     NOT NULL DEFAULT false,
  sort_order   int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, asset_type, asset_code)
);

COMMENT ON TABLE dialogue_package_assets IS
  'Maps canonical asset codes to dialogue packages. asset_type FKs to '
  'asset_type_registry — new types require only an INSERT there. No URLs, '
  'no generation status, no provider metadata. Asset code only.';

CREATE INDEX idx_dlg_assets_package ON dialogue_package_assets (package_code, asset_type);

ALTER TABLE dialogue_package_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dlg_assets_read_system" ON dialogue_package_assets
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_assets.package_id AND dp.is_system = true
    )
  );

CREATE POLICY "dlg_assets_read_own" ON dialogue_package_assets
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_assets.package_id AND dp.creator_id = auth.uid()
    )
  );

CREATE POLICY "dlg_assets_insert_own" ON dialogue_package_assets
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_assets.package_id AND dp.creator_id = auth.uid()
    )
  );


-- ── 4. dialogue_package_responses ────────────────────────────────────────────
-- Exactly 3 client response options per package.
-- sort_order 1 | 2 | 3 enforced by UNIQUE + CHECK.
-- next_package_code routes to the next node via engine_package_registry.

CREATE TABLE dialogue_package_responses (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id          uuid        NOT NULL
                                    REFERENCES dialogue_packages(id) ON DELETE CASCADE,
  package_code        text        NOT NULL,
  sort_order          int         NOT NULL CHECK (sort_order BETWEEN 1 AND 3),
  display_text        text        NOT NULL DEFAULT '',
  internal_intent     text        NOT NULL DEFAULT '',
  next_package_code   text        REFERENCES engine_package_registry(code),
  conditions          jsonb       NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, sort_order)
);

COMMENT ON TABLE dialogue_package_responses IS
  'Exactly 3 client response options per dialogue package. '
  'next_package_code routes to the next node via engine_package_registry. '
  'NULL next_package_code = terminal node.';

CREATE INDEX idx_dlg_resp_package ON dialogue_package_responses (package_code);

ALTER TABLE dialogue_package_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dlg_resp_read_system" ON dialogue_package_responses
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_responses.package_id AND dp.is_system = true
    )
  );

CREATE POLICY "dlg_resp_read_own" ON dialogue_package_responses
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_responses.package_id AND dp.creator_id = auth.uid()
    )
  );

CREATE POLICY "dlg_resp_insert_own" ON dialogue_package_responses
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM dialogue_packages dp
      WHERE dp.id = dialogue_package_responses.package_id AND dp.creator_id = auth.uid()
    )
  );


-- ── 5. Register MT-END-001 in engine_package_registry ────────────────────────

INSERT INTO engine_package_registry
  (code, package_group, label, description, parent_code, package_type, sort_order)
VALUES (
  'MT-END-001',
  'MT',
  'Massage Therapist — Ending',
  'Conversation stage package covering the closing of the massage session. '
  'Handles: session conclusion, emotional closure, rebooking intent, and farewell. '
  'Loaded by the Fetch Engine when the MT-001 role is active and the session is in the ending stage.',
  'MT-001',
  'stage',
  4
)
ON CONFLICT (code) DO NOTHING;


-- ── 6. Seed MT dialogue packages ─────────────────────────────────────────────

INSERT INTO dialogue_packages
  (package_code, role_code, stage, sequence, version, status,
   dialogue_text, emotion, camera_angle, scene_context,
   generation_status, generation_metadata, is_system)
VALUES
  (
    'MT-BEG-001',
    'MT-001',
    'beginning',
    1,
    1,
    'active',
    'Welcome, and thank you for choosing to spend this time with me. Before we begin, I want to make sure you feel completely comfortable and at ease. Tell me — what brings you in today, and is there anything specific I should know about how your body is feeling?',
    'warm_welcoming',
    'medium_shot_level',
    'Treatment room. Therapist standing near the massage table in a calm, professional posture. Warm, diffused lighting. Clean and serene environment.',
    'generated',
    '{"role_blueprint": {"role_code": "MT-001"}, "generation_type": "system_seed", "seeded_at": "2026-06-29"}',
    true
  ),
  (
    'MT-MID-001',
    'MT-001',
    'middle',
    1,
    1,
    'active',
    'You''re doing wonderfully. I can feel the tension beginning to release — your body is responding beautifully to the treatment. Keep breathing deeply and allow yourself to fully surrender to this moment. You deserve every bit of this rest.',
    'calm_focused',
    'over_shoulder_soft',
    'Mid-session. Therapist actively working with focused, attentive expression. Client relaxed on the table. Calm, professional atmosphere.',
    'generated',
    '{"role_blueprint": {"role_code": "MT-001"}, "generation_type": "system_seed", "seeded_at": "2026-06-29"}',
    true
  ),
  (
    'MT-END-001',
    'MT-001',
    'ending',
    1,
    1,
    'active',
    'That was a truly wonderful session. I hope you''re feeling the difference — lighter, clearer, more at ease. Take all the time you need before you get up. Your body has done some beautiful work today. How are you feeling?',
    'gentle_warm',
    'medium_shot_soft',
    'Session concluding. Therapist standing nearby with a warm, caring expression. Treatment room in a tidy, welcoming state.',
    'generated',
    '{"role_blueprint": {"role_code": "MT-001"}, "generation_type": "system_seed", "seeded_at": "2026-06-29"}',
    true
  );


-- ── 7. Seed dialogue package assets ──────────────────────────────────────────
-- Links each stage dialogue package to its primary image asset code.
-- role_image_library phase mapping: 001-003=beginning, 004-006=middle, 007-009=ending

INSERT INTO dialogue_package_assets
  (package_id, package_code, asset_type, asset_code, is_primary, sort_order)
SELECT dp.id, 'MT-BEG-001', 'image', 'MT-IMG-001', true, 1
  FROM dialogue_packages dp WHERE dp.package_code = 'MT-BEG-001';

INSERT INTO dialogue_package_assets
  (package_id, package_code, asset_type, asset_code, is_primary, sort_order)
SELECT dp.id, 'MT-MID-001', 'image', 'MT-IMG-004', true, 1
  FROM dialogue_packages dp WHERE dp.package_code = 'MT-MID-001';

INSERT INTO dialogue_package_assets
  (package_id, package_code, asset_type, asset_code, is_primary, sort_order)
SELECT dp.id, 'MT-END-001', 'image', 'MT-IMG-007', true, 1
  FROM dialogue_packages dp WHERE dp.package_code = 'MT-END-001';


-- ── 8. Seed dialogue package responses ───────────────────────────────────────

-- MT-BEG-001 responses: leads into middle or stays in beginning
INSERT INTO dialogue_package_responses
  (package_id, package_code, sort_order, display_text, internal_intent, next_package_code)
SELECT dp.id, 'MT-BEG-001', 1,
  'I''m ready to begin whenever you are.',
  'client_ready_to_start',
  'MT-MID-001'
FROM dialogue_packages dp WHERE dp.package_code = 'MT-BEG-001';

INSERT INTO dialogue_package_responses
  (package_id, package_code, sort_order, display_text, internal_intent, next_package_code)
SELECT dp.id, 'MT-BEG-001', 2,
  'Could you tell me more about the session plan?',
  'client_wants_more_information',
  'MT-BEG-001'
FROM dialogue_packages dp WHERE dp.package_code = 'MT-BEG-001';

INSERT INTO dialogue_package_responses
  (package_id, package_code, sort_order, display_text, internal_intent, next_package_code)
SELECT dp.id, 'MT-BEG-001', 3,
  'I have a specific area of tension I''d like to focus on.',
  'client_flagging_tension_area',
  'MT-BEG-001'
FROM dialogue_packages dp WHERE dp.package_code = 'MT-BEG-001';

-- MT-MID-001 responses: continues or transitions to ending
INSERT INTO dialogue_package_responses
  (package_id, package_code, sort_order, display_text, internal_intent, next_package_code)
SELECT dp.id, 'MT-MID-001', 1,
  'That feels wonderful, please continue.',
  'client_comfortable_continue',
  'MT-MID-001'
FROM dialogue_packages dp WHERE dp.package_code = 'MT-MID-001';

INSERT INTO dialogue_package_responses
  (package_id, package_code, sort_order, display_text, internal_intent, next_package_code)
SELECT dp.id, 'MT-MID-001', 2,
  'Could you spend more time on my shoulders?',
  'client_requesting_focus_area',
  'MT-MID-001'
FROM dialogue_packages dp WHERE dp.package_code = 'MT-MID-001';

INSERT INTO dialogue_package_responses
  (package_id, package_code, sort_order, display_text, internal_intent, next_package_code)
SELECT dp.id, 'MT-MID-001', 3,
  'I think I''m ready to start winding down.',
  'client_ready_to_end',
  'MT-END-001'
FROM dialogue_packages dp WHERE dp.package_code = 'MT-MID-001';

-- MT-END-001 responses: terminal — NULL next_package_code
INSERT INTO dialogue_package_responses
  (package_id, package_code, sort_order, display_text, internal_intent, next_package_code)
SELECT dp.id, 'MT-END-001', 1,
  'I feel incredible, thank you so much.',
  'client_positive_close',
  NULL
FROM dialogue_packages dp WHERE dp.package_code = 'MT-END-001';

INSERT INTO dialogue_package_responses
  (package_id, package_code, sort_order, display_text, internal_intent, next_package_code)
SELECT dp.id, 'MT-END-001', 2,
  'Could I book another session soon?',
  'client_rebook_intent',
  NULL
FROM dialogue_packages dp WHERE dp.package_code = 'MT-END-001';

INSERT INTO dialogue_package_responses
  (package_id, package_code, sort_order, display_text, internal_intent, next_package_code)
SELECT dp.id, 'MT-END-001', 3,
  'Thank you. I''ll definitely be back.',
  'client_farewell_positive',
  NULL
FROM dialogue_packages dp WHERE dp.package_code = 'MT-END-001';
