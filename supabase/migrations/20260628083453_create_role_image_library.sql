-- ═══════════════════════════════════════════════════════════════════════════
-- ROLE IMAGE LIBRARY
--
-- Stores per-creator images for every Role Blueprint × Phase × Sequence slot.
-- Each row is a completely independent image asset — regenerating one row
-- never affects any other row.
--
-- Image code format:  {ROLE_PREFIX}-IMG-{SEQ:03d}
--   MT-IMG-001 … MT-IMG-009  (Massage Therapist, 3 phases × 3 images)
--   GF-IMG-001 … GF-IMG-009  (Girlfriend)
--   DF-IMG-001 … DF-IMG-009  (Date Friend)
--   PE-IMG-001 … PE-IMG-009  (Personal Escort)
--   RP-IMG-001 … RP-IMG-009  (Role Player)
--
-- Generation pipeline:
--   Master AI Identity → Canonical Body Asset → Base Clothing
--   → Dress Layer → Accessory Layer → Role Blueprint → Provider → Final Image
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE role_image_library (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Image identification
  image_code             text        NOT NULL,   -- MT-IMG-001, GF-IMG-002 …
  role_blueprint_id      uuid        NOT NULL REFERENCES ai_role_blueprints(id),
  role_code              text        NOT NULL,   -- MT-001, GF-001 …
  phase                  text        NOT NULL
                         CHECK (phase IN ('beginning','middle','ending')),
  sequence               int         NOT NULL,   -- 1, 2, 3 within a phase

  -- Version control — increments on every regeneration
  version                int         NOT NULL DEFAULT 1,

  -- Identity composition references (all nullable until first generation)
  master_ai_identity_id  uuid        REFERENCES master_ai_identities(id),
  body_asset_layer_id    uuid        REFERENCES ai_identity_layers(id),
  base_clothing_layer_id uuid        REFERENCES ai_identity_layers(id),
  dress_id               uuid        REFERENCES ai_dress_library(id),
  accessory_ids          uuid[]      NOT NULL DEFAULT '{}',

  -- Generated asset
  image_url              text,
  storage_path           text,
  generation_status      text        NOT NULL DEFAULT 'pending'
                         CHECK (generation_status IN ('pending','generating','generated','failed')),
  error_message          text,

  -- Version metadata for auditing layer changes
  body_asset_version     int         NOT NULL DEFAULT 1,
  clothing_layer_version int         NOT NULL DEFAULT 1,
  role_blueprint_version int         NOT NULL DEFAULT 1,

  -- Flexible structured metadata (generation technique, source refs, etc.)
  metadata               jsonb       NOT NULL DEFAULT '{}',

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  -- One active image per slot per creator
  UNIQUE (creator_id, image_code)
);

COMMENT ON TABLE role_image_library IS
  'Per-creator image library for every Role Blueprint × Phase × Sequence slot. '
  'Each row is an independent image asset — regenerating one never affects others. '
  'Generation pipeline: Master AI Identity → Canonical Body → Base Clothing '
  '→ Dress → Accessories → Role Blueprint → Provider → Final Image.';

COMMENT ON COLUMN role_image_library.image_code IS
  'Unique slot code per role. Format: {ROLE_PREFIX}-IMG-{SEQ:03d}. '
  'MT-IMG-001 = Massage Therapist, beginning phase, sequence 1.';

COMMENT ON COLUMN role_image_library.version IS
  'Increments on every regeneration. Tracks how many times a slot has been generated.';

COMMENT ON COLUMN role_image_library.metadata IS
  'Structured metadata: generation_technique, apr_code, apr_name, bt_code, bt_name, '
  'role_name, phase_label, composition_notes, generated_at.';

ALTER TABLE role_image_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_role_images" ON role_image_library
  FOR SELECT TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "insert_own_role_images" ON role_image_library
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "update_own_role_images" ON role_image_library
  FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "delete_own_role_images" ON role_image_library
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);


-- ── Storage bucket ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'role-image-library',
  'role-image-library',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "read_role_image_library_objects" ON storage.objects
  FOR SELECT USING (bucket_id = 'role-image-library');

CREATE POLICY "upload_role_image_library_objects" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'role-image-library');

CREATE POLICY "update_role_image_library_objects" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'role-image-library');

CREATE POLICY "delete_role_image_library_objects" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'role-image-library');
