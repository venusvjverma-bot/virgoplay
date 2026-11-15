-- ═══════════════════════════════════════════════════════════════════════════
-- LAYERED IDENTITY ARCHITECTURE
--
-- Replaces the flat engine_ai_identities table with a modular system:
--
--   master_ai_identities   — top-level identity record per creator
--   ai_identity_layers     — independent composition layers per identity
--   ai_dress_library       — platform-wide dress/outfit catalog
--   ai_accessory_library   — platform-wide accessory catalog
--   ai_role_blueprints     — rendering instructions per role
--
-- Generation pipeline (current Phase 1, extensible to future phases):
--
--   APR (face) + BT (body) + base clothing + dress + accessories + blueprint
--   → composed_preview_url (portal preview)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. master_ai_identities ───────────────────────────────────────────────────
-- Top-level identity record. composed_preview_url is the Portal-visible preview
-- produced by assembling the active layers via the generation engine.

CREATE TABLE master_ai_identities (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_code        text        NOT NULL,   -- AI-0001, AI-0002 …
  -- Face layer reference
  apr_code             text        NOT NULL,   -- APR-001 … APR-008
  apr_name             text,
  -- Body blueprint reference
  bt_code              text        NOT NULL,   -- BT-001 … BT-005
  bt_name              text,
  -- Assembled portal preview
  composed_preview_url text,
  storage_path         text,
  generation_status    text        NOT NULL DEFAULT 'pending'
                       CHECK (generation_status IN ('pending','processing','completed','failed')),
  error_message        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, identity_code)
);

COMMENT ON TABLE master_ai_identities IS
  'Top-level Master AI Identity per creator. '
  'composed_preview_url is the assembled portal preview. '
  'Canonical reference for Image Library, Scenario Library, Package Library, '
  'Video Library, and AI Companion System.';
COMMENT ON COLUMN master_ai_identities.composed_preview_url IS
  'Portal-visible preview assembled from all active layers. '
  'Never generated from a previously-generated image — always from current source assets.';

ALTER TABLE master_ai_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_master_identities" ON master_ai_identities
  FOR SELECT TO authenticated USING (auth.uid() = creator_id);
CREATE POLICY "insert_own_master_identities" ON master_ai_identities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "update_own_master_identities" ON master_ai_identities
  FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "delete_own_master_identities" ON master_ai_identities
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);


-- ── 2. ai_identity_layers ─────────────────────────────────────────────────────
-- Each row is one discrete composition layer belonging to an identity.
-- Phase 1 produces two layers per identity (body + base_clothing), both
-- reference_only — the composed_preview_url holds the rendered result.
-- Future phases will add dress, accessory, and role_blueprint layers with
-- standalone generated images.
--
-- Layer types and codes:
--   body          AI-XXXX-A   References the BT preset
--   base_clothing AI-XXXX-B   References the default clothing from the BT preset
--   dress         AI-XXXX-D1  References ai_dress_library (DR-*)
--   accessory     AI-XXXX-ACC References ai_accessory_library (ACC-*)

CREATE TABLE ai_identity_layers (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id   uuid        NOT NULL REFERENCES master_ai_identities(id) ON DELETE CASCADE,
  creator_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  layer_code    text        NOT NULL,   -- AI-0009-A, AI-0009-B, AI-0009-D1 …
  layer_type    text        NOT NULL
                CHECK (layer_type IN ('face','body','base_clothing','dress','accessory','role_blueprint')),
  layer_name    text,
  source_ref    text,                   -- APR-003, BT-003, DR-MT-001, ACC-001 …
  layer_status  text        NOT NULL DEFAULT 'reference_only'
                CHECK (layer_status IN ('reference_only','generating','generated','failed')),
  image_url     text,                   -- null for reference_only layers
  storage_path  text,
  metadata      jsonb       NOT NULL DEFAULT '{}',
  sort_order    int         NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id, layer_code)
);

COMMENT ON TABLE ai_identity_layers IS
  'Independent composition layers per Master AI Identity. '
  'Layers are never permanently merged — the generation engine assembles them '
  'dynamically for each render. Changing one layer never regenerates another.';
COMMENT ON COLUMN ai_identity_layers.layer_status IS
  'reference_only = layer defined by source_ref, no standalone image. '
  'generated      = layer has its own standalone image_url.';
COMMENT ON COLUMN ai_identity_layers.metadata IS
  'Layer-specific data: colour, texture, material, prompt_fragment, etc.';

ALTER TABLE ai_identity_layers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_layers" ON ai_identity_layers
  FOR SELECT TO authenticated USING (auth.uid() = creator_id);
CREATE POLICY "insert_own_layers" ON ai_identity_layers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "update_own_layers" ON ai_identity_layers
  FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "delete_own_layers" ON ai_identity_layers
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);


-- ── 3. ai_dress_library ───────────────────────────────────────────────────────
-- Platform-wide catalog of dresses / outfits.
-- Each dress is an independent reusable asset — applying it never modifies
-- the body or base_clothing layers.

CREATE TABLE ai_dress_library (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dress_code               text        NOT NULL UNIQUE, -- DR-MT-001, DR-GYM-001 …
  dress_name               text        NOT NULL,
  role_code                text,                        -- MT-001, GF-001, null = universal
  description              text,
  generation_prompt_fragment text,
  image_url                text,
  metadata                 jsonb       NOT NULL DEFAULT '{}',
  is_active                boolean     NOT NULL DEFAULT true,
  sort_order               int         NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_dress_library IS
  'Platform-wide dress catalog. Each dress is a reusable layer — '
  'applying, changing, or removing a dress never regenerates the body asset.';

ALTER TABLE ai_dress_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_dress_library" ON ai_dress_library
  FOR SELECT TO authenticated USING (true);


-- ── 4. ai_accessory_library ───────────────────────────────────────────────────
-- Platform-wide catalog of accessories.
-- Each accessory is independent from body, clothing, and dress layers.

CREATE TABLE ai_accessory_library (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  accessory_code           text        NOT NULL UNIQUE, -- ACC-001, ACC-002 …
  accessory_name           text        NOT NULL,
  accessory_type           text,                        -- jewellery, watch, eyewear, badge
  description              text,
  generation_prompt_fragment text,
  image_url                text,
  metadata                 jsonb       NOT NULL DEFAULT '{}',
  is_active                boolean     NOT NULL DEFAULT true,
  sort_order               int         NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_accessory_library IS
  'Platform-wide accessory catalog. Each accessory is fully independent — '
  'can be added, removed, or changed without touching body, clothing, or dress layers.';

ALTER TABLE ai_accessory_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_accessory_library" ON ai_accessory_library
  FOR SELECT TO authenticated USING (true);


-- ── 5. ai_role_blueprints ─────────────────────────────────────────────────────
-- Platform-wide rendering instructions per role.
-- The generation engine reads this to compose environment, pose, lighting,
-- camera angle, and expression for role-specific image generation.

CREATE TABLE ai_role_blueprints (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code                text        NOT NULL UNIQUE, -- MT-001, GF-001 …
  role_name                text        NOT NULL,
  environment              jsonb       NOT NULL DEFAULT '{}',
  camera                   jsonb       NOT NULL DEFAULT '{}',
  pose                     jsonb       NOT NULL DEFAULT '{}',
  expression               jsonb       NOT NULL DEFAULT '{}',
  generation_prompt_fragment text,
  is_active                boolean     NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_role_blueprints IS
  'Rendering blueprint per role. The generation engine assembles: '
  'Face + Body + Clothing + Dress + Accessories + RoleBlueprint → final image. '
  'Provider-independent: the blueprint is a data definition, not tied to any AI model.';

ALTER TABLE ai_role_blueprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_role_blueprints" ON ai_role_blueprints
  FOR SELECT TO authenticated USING (true);


-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Dress Library — initial catalog ──────────────────────────────────────────
INSERT INTO ai_dress_library (dress_code, dress_name, role_code, description, generation_prompt_fragment, sort_order) VALUES
  ('DR-MT-001', 'Massage Robe',        'MT-001', 'Soft white/beige therapeutic robe, spa setting',
   'wearing a soft white spa robe, professional massage therapist attire',             10),
  ('DR-MT-002', 'Spa Uniform',         'MT-001', 'Clean spa uniform, fitted professional look',
   'wearing a clean fitted spa uniform, light neutral colors',                          20),
  ('DR-GF-001', 'Casual Date Dress',   'GF-001', 'Relaxed, stylish casual outfit for everyday wear',
   'wearing a casual stylish dress, relaxed and approachable',                          30),
  ('DR-GF-002', 'Evening Dress',       'GF-001', 'Elegant evening wear for romantic occasions',
   'wearing an elegant evening dress, sophisticated and romantic',                      40),
  ('DR-DF-001', 'Smart Casual',        'DF-001', 'Smart casual outfit for a date setting',
   'wearing a smart casual outfit, polished and friendly',                              50),
  ('DR-PE-001', 'Luxury Escort Dress', 'PE-001', 'High-end luxury outfit, professional escort style',
   'wearing a high-end luxury dress, elegant and sophisticated',                        60),
  ('DR-GYM-001','Gym Outfit',          NULL,     'Athletic wear for gym or fitness setting',
   'wearing athletic gym wear, sports bra and leggings',                                70),
  ('DR-SPA-001','Luxury Spa Uniform',  NULL,     'Premium spa/wellness uniform',
   'wearing a luxury spa uniform, premium wellness aesthetic',                          80),
  ('DR-CAS-001','Casual Outfit',       NULL,     'Relaxed everyday casual clothing',
   'wearing casual everyday clothing, natural and relaxed',                             90),
  ('DR-BCH-001','Beachwear',           NULL,     'Beach and swimwear setting',
   'wearing beachwear, beach setting with natural light',                              100);

-- ── Accessory Library — initial catalog ─────────────────────────────────────
INSERT INTO ai_accessory_library (accessory_code, accessory_name, accessory_type, description, generation_prompt_fragment, sort_order) VALUES
  ('ACC-001', 'Elegant Watch',     'watch',     'Slim elegant wristwatch',
   'wearing a slim elegant wristwatch',                                                 10),
  ('ACC-002', 'Name Badge',        'badge',     'Professional name badge on lanyard or clip',
   'with a professional name badge',                                                    20),
  ('ACC-003', 'Simple Necklace',   'jewellery', 'Delicate thin necklace, gold or silver',
   'wearing a delicate thin necklace',                                                  30),
  ('ACC-004', 'Stud Earrings',     'jewellery', 'Simple gold or silver stud earrings',
   'wearing simple stud earrings',                                                      40),
  ('ACC-005', 'Pearl Necklace',    'jewellery', 'Classic pearl necklace, sophisticated look',
   'wearing a classic pearl necklace',                                                  50),
  ('ACC-006', 'Eyewear — Classic', 'eyewear',   'Classic frame glasses, professional look',
   'wearing classic professional eyeglasses',                                           60),
  ('ACC-007', 'Eyewear — Fashion', 'eyewear',   'Stylish fashion eyewear',
   'wearing stylish fashion glasses',                                                   70),
  ('ACC-008', 'Bangles',           'jewellery', 'Elegant gold or silver bangles',
   'wearing elegant bangles on the wrist',                                              80);

-- ── Role Blueprints — initial catalog ─────────────────────────────────────────
INSERT INTO ai_role_blueprints (role_code, role_name, environment, camera, pose, expression, generation_prompt_fragment) VALUES
  ('MT-001', 'Massage Therapist',
   '{"setting":"professional massage studio","lighting":"warm soft ambient","background":"clean neutral spa"}',
   '{"angle":"medium shot","distance":"bust to full body","framing":"professional portrait"}',
   '{"stance":"standing professional","body":"upright professional posture"}',
   '{"mood":"calm professional","eye_contact":"warm direct","smile":"soft professional"}',
   'professional massage therapist, spa studio setting, warm ambient lighting, calm professional expression'),

  ('GF-001', 'Girlfriend',
   '{"setting":"indoor casual home or cafe","lighting":"natural warm light","background":"cozy comfortable"}',
   '{"angle":"eye level","distance":"medium to close","framing":"intimate portrait"}',
   '{"stance":"relaxed natural","body":"casual comfortable posture"}',
   '{"mood":"warm affectionate","eye_contact":"loving direct","smile":"natural warm smile"}',
   'warm girlfriend energy, natural home setting, soft natural lighting, affectionate expression'),

  ('DF-001', 'Date Friend',
   '{"setting":"restaurant or casual outdoor","lighting":"warm evening light","background":"stylish social setting"}',
   '{"angle":"eye level","distance":"medium","framing":"social portrait"}',
   '{"stance":"confident casual","body":"relaxed social posture"}',
   '{"mood":"playful friendly","eye_contact":"engaging","smile":"bright friendly smile"}',
   'date setting, social environment, warm evening lighting, playful friendly expression'),

  ('PE-001', 'Personal Escort',
   '{"setting":"upscale venue or hotel lobby","lighting":"elegant ambient","background":"luxury environment"}',
   '{"angle":"slight low angle","distance":"full body to medium","framing":"elegant portrait"}',
   '{"stance":"poised elegant","body":"tall confident sophisticated posture"}',
   '{"mood":"sophisticated composed","eye_contact":"confident direct","smile":"subtle elegant"}',
   'upscale elegant setting, luxury environment, sophisticated composed expression'),

  ('RP-001', 'Role Player',
   '{"setting":"scenario-dependent","lighting":"scenario-dependent","background":"scenario-dependent"}',
   '{"angle":"scenario-dependent","distance":"scenario-dependent","framing":"scenario-dependent"}',
   '{"stance":"character-appropriate","body":"character-appropriate posture"}',
   '{"mood":"character-appropriate","eye_contact":"character-appropriate","smile":"character-appropriate"}',
   'character role play setting, character-appropriate expression and posture');


-- ═══════════════════════════════════════════════════════════════════════════
-- DATA MIGRATION: engine_ai_identities → master_ai_identities
-- ═══════════════════════════════════════════════════════════════════════════

-- Migrate all existing identity records
INSERT INTO master_ai_identities (
  id, creator_id, identity_code,
  apr_code, apr_name, bt_code, bt_name,
  composed_preview_url, storage_path,
  generation_status, error_message,
  created_at, updated_at
)
SELECT
  id, creator_id, identity_code,
  apr_code, apr_name, bt_code, bt_name,
  master_identity_image_url, storage_path,
  generation_status, error_message,
  created_at, updated_at
FROM engine_ai_identities
ON CONFLICT (creator_id, identity_code) DO NOTHING;

-- Create body layer records (AI-XXXX-A) for every migrated identity
INSERT INTO ai_identity_layers (
  identity_id, creator_id,
  layer_code, layer_type, layer_name,
  source_ref, layer_status,
  metadata, sort_order
)
SELECT
  id, creator_id,
  identity_code || '-A', 'body',
  'Base Body (' || COALESCE(bt_name, bt_code) || ')',
  bt_code, 'reference_only',
  jsonb_build_object(
    'bt_code',    bt_code,
    'bt_name',    bt_name,
    'phase',      1,
    'note',       'Body geometry and proportions defined by BT preset reference image'
  ),
  1
FROM master_ai_identities
ON CONFLICT (identity_id, layer_code) DO NOTHING;

-- Create base clothing layer records (AI-XXXX-B) for every migrated identity
INSERT INTO ai_identity_layers (
  identity_id, creator_id,
  layer_code, layer_type, layer_name,
  source_ref, layer_status,
  metadata, sort_order
)
SELECT
  id, creator_id,
  identity_code || '-B', 'base_clothing',
  'Base Clothing (' || COALESCE(bt_name, bt_code) || ' default)',
  bt_code, 'reference_only',
  jsonb_build_object(
    'bt_code',      bt_code,
    'bt_name',      bt_name,
    'clothing_ref', 'Default clothing from BT preset reference image',
    'phase',        1,
    'note',         'Clothing can be replaced by Dress Library layers without modifying the Body Asset'
  ),
  2
FROM master_ai_identities
ON CONFLICT (identity_id, layer_code) DO NOTHING;
