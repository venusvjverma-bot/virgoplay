-- ═══════════════════════════════════════════════════════════════════════════
-- UNIFORM LIBRARY
--
-- Extends the platform dress catalog with structured categories and seeds
-- the full uniform collection covering all roles and sub-categories.
--
-- Adds creator_uniform_library: per-creator generated previews, notes, and
-- version tracking for every dress in the catalog.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Add category to ai_dress_library ──────────────────────────────────────

ALTER TABLE ai_dress_library
  ADD COLUMN category text;

COMMENT ON COLUMN ai_dress_library.category IS
  'Sub-category within the role. Examples: Spa Robes, Massage Uniforms, Casual, Elegant, Nurse.';


-- ── 2. Update existing dresses with categories ────────────────────────────────

UPDATE ai_dress_library SET category = 'Spa Robes'         WHERE dress_code = 'DR-MT-001';
UPDATE ai_dress_library SET category = 'Massage Uniforms'  WHERE dress_code = 'DR-MT-002';
UPDATE ai_dress_library SET category = 'Casual'            WHERE dress_code = 'DR-GF-001';
UPDATE ai_dress_library SET category = 'Elegant'           WHERE dress_code = 'DR-GF-002';
UPDATE ai_dress_library SET category = 'Restaurant'        WHERE dress_code = 'DR-DF-001';
UPDATE ai_dress_library SET category = 'Premium'           WHERE dress_code = 'DR-PE-001';
UPDATE ai_dress_library SET category = 'Athletic'          WHERE dress_code = 'DR-GYM-001';
UPDATE ai_dress_library SET category = 'Spa Robes'         WHERE dress_code = 'DR-SPA-001';
UPDATE ai_dress_library SET category = 'Casual'            WHERE dress_code = 'DR-CAS-001';
UPDATE ai_dress_library SET category = 'Resort'            WHERE dress_code = 'DR-BCH-001';


-- ── 3. Seed full uniform catalog ──────────────────────────────────────────────

INSERT INTO ai_dress_library (dress_code, dress_name, role_code, category, description, generation_prompt_fragment, metadata, sort_order)
VALUES

-- ── Massage Therapist ─────────────────────────────────────────────────────────
('DR-MT-003', 'Deluxe Spa Robe',           'MT-001', 'Spa Robes',
 'Premium waffle-weave spa robe, deep V-collar, belted waist',
 'wearing a premium cream waffle-weave spa robe, deep V-collar, tied belt, professional spa setting',
 '{"fabric":"waffle-weave cotton","primary_color":"cream","neckline":"deep-v","sleeves":"full","length":"knee","fit":"relaxed","professional_level":"luxury"}', 15),

('DR-MT-004', 'Therapist Clinic Uniform',   'MT-001', 'Massage Uniforms',
 'Tailored clinic uniform with mandarin collar, functional pockets',
 'wearing a tailored massage clinic uniform, mandarin collar, functional side pockets, clean professional look',
 '{"fabric":"stretch cotton","primary_color":"white","secondary_color":"pale-blue","neckline":"mandarin","sleeves":"short","length":"mid-thigh","fit":"fitted","professional_level":"clinical"}', 25),

-- ── Girlfriend ────────────────────────────────────────────────────────────────
('DR-GF-003', 'Cosy Sleepwear Set',         'GF-001', 'Sleepwear',
 'Satin cami and shorts set, soft pastel tones, intimate and relaxed',
 'wearing a satin sleepwear cami and shorts set, soft pastel pink, relaxed intimate home setting',
 '{"fabric":"satin","primary_color":"blush-pink","neckline":"spaghetti-strap","sleeves":"none","length":"shorts","fit":"relaxed","pattern":"solid"}', 45),

('DR-GF-004', 'Elegant Evening Gown',       'GF-001', 'Elegant',
 'Floor-length satin evening gown, ruched bodice, romantic silhouette',
 'wearing an elegant floor-length satin evening gown, ruched bodice, romantic sophisticated look',
 '{"fabric":"satin","primary_color":"midnight-blue","neckline":"strapless","sleeves":"none","length":"floor","fit":"fitted","pattern":"solid","professional_level":"formal"}', 42),

('DR-GF-005', 'Weekend Casual Set',         'GF-001', 'Casual',
 'Relaxed linen co-ord set, comfortable everyday style',
 'wearing a relaxed linen co-ord set, natural tones, comfortable weekend casual style',
 '{"fabric":"linen","primary_color":"sand","neckline":"crew","sleeves":"short","length":"knee","fit":"relaxed","pattern":"solid"}', 32),

-- ── Dating / Date Friend ──────────────────────────────────────────────────────
('DR-DF-002', 'Evening Cocktail Dress',     'DF-001', 'Evening Wear',
 'Sleeveless cocktail dress with pleated skirt, perfect for evening events',
 'wearing an elegant sleeveless cocktail dress with pleated skirt, evening setting, sophisticated',
 '{"fabric":"chiffon","primary_color":"burgundy","neckline":"v-neck","sleeves":"none","length":"midi","fit":"a-line","professional_level":"formal"}', 55),

('DR-DF-003', 'Luxury Date Dress',          'DF-001', 'Luxury Dress',
 'Premium bodycon mini dress with asymmetric neckline, high-end date look',
 'wearing a premium bodycon mini dress with asymmetric neckline, high-end sophisticated date look',
 '{"fabric":"crepe","primary_color":"champagne","neckline":"asymmetric","sleeves":"one-shoulder","length":"mini","fit":"bodycon","professional_level":"luxury"}', 58),

('DR-DF-004', 'Restaurant Chic Dress',      'DF-001', 'Restaurant',
 'Polished wrap dress, perfect for upscale restaurant settings',
 'wearing a polished wrap dress, tasteful print, upscale restaurant setting, confident and chic',
 '{"fabric":"silk-blend","primary_color":"navy","neckline":"wrap","sleeves":"three-quarter","length":"midi","fit":"wrap","pattern":"subtle-print"}', 52),

-- ── Personal Escort ───────────────────────────────────────────────────────────
('DR-PE-002', 'Hotel Formal Gown',          'PE-001', 'Hotel',
 'Sleek column gown for luxury hotel events, understated elegance',
 'wearing a sleek column evening gown, luxury hotel setting, understated elegance, high-end look',
 '{"fabric":"silk","primary_color":"black","neckline":"boat","sleeves":"none","length":"floor","fit":"column","professional_level":"luxury"}', 62),

('DR-PE-003', 'Business Power Dress',       'PE-001', 'Business',
 'Sharp business-appropriate sheath dress with blazer option',
 'wearing a sharp tailored sheath dress with matching blazer, business professional setting, powerful and polished',
 '{"fabric":"wool-blend","primary_color":"charcoal","secondary_color":"white","neckline":"notch-lapel","sleeves":"three-quarter","length":"knee","fit":"sheath","professional_level":"executive"}', 65),

-- ── Roleplay ──────────────────────────────────────────────────────────────────
('DR-RP-001', 'Nurse Uniform',              'RP-001', 'Nurse',
 'Classic nurse uniform, white pinafore dress with red cross detail',
 'wearing a classic nurse uniform, white pinafore dress with red cross detail, professional medical setting',
 '{"fabric":"cotton","primary_color":"white","secondary_color":"red","neckline":"collar","sleeves":"short","length":"mid-thigh","fit":"fitted","pattern":"uniform","professional_level":"roleplay"}', 110),

('DR-RP-002', 'Secretary Outfit',           'RP-001', 'Secretary',
 'Sharp pencil skirt suit, professional office secretary style',
 'wearing a sharp fitted pencil skirt and blazer suit, office secretary style, professional and confident',
 '{"fabric":"polyester-blend","primary_color":"black","secondary_color":"white","neckline":"collared-blouse","sleeves":"full","length":"knee","fit":"tailored","professional_level":"roleplay"}', 120),

('DR-RP-003', 'Teacher Blazer Dress',       'RP-001', 'Teacher',
 'Academic-style blazer dress, authoritative yet approachable',
 'wearing an academic-style blazer dress with glasses, authoritative teacher look, professional setting',
 '{"fabric":"tweed-blend","primary_color":"charcoal","secondary_color":"ivory","neckline":"lapel","sleeves":"full","length":"knee","fit":"structured","professional_level":"roleplay"}', 130),

('DR-RP-004', 'Police Uniform',             'RP-001', 'Police',
 'Navy police-inspired uniform with badge details',
 'wearing a navy police-inspired uniform with badge details, authoritative confident posture',
 '{"fabric":"cotton-blend","primary_color":"navy","secondary_color":"silver","neckline":"collar","sleeves":"short","length":"mid-thigh","fit":"fitted","pattern":"uniform","professional_level":"roleplay"}', 140),

('DR-RP-005', 'Maid Outfit',                'RP-001', 'Maid',
 'Classic French maid dress with white apron and lace details',
 'wearing a classic French maid dress with white apron and lace trim, elegant domestic roleplay setting',
 '{"fabric":"cotton","primary_color":"black","secondary_color":"white","neckline":"sweetheart","sleeves":"short","length":"mini","fit":"a-line","pattern":"apron-overlay","professional_level":"roleplay"}', 150)

ON CONFLICT (dress_code) DO NOTHING;


-- ── 4. creator_uniform_library ────────────────────────────────────────────────
-- Per-creator preview record for every dress in the catalog.
-- One row per (creator_id, dress_id) — version increments on regeneration.
-- Enables notes, generation tracking, and layer snapshot storage.

CREATE TABLE creator_uniform_library (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dress_id              uuid        NOT NULL REFERENCES ai_dress_library(id),
  master_ai_identity_id uuid        REFERENCES master_ai_identities(id),
  preview_image_url     text,
  storage_path          text,
  generation_status     text        NOT NULL DEFAULT 'pending'
                        CHECK (generation_status IN ('pending','generating','generated','failed')),
  error_message         text,
  version               int         NOT NULL DEFAULT 1,
  render_base           text,       -- 'dress_image' | 'bt_body_fallback'
  creator_notes         text,
  metadata              jsonb       NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, dress_id)
);

COMMENT ON TABLE creator_uniform_library IS
  'Per-creator uniform preview records. One row per (creator, dress). '
  'Stores generated preview image, notes, and full layer snapshot. '
  'Version increments on every regeneration.';

ALTER TABLE creator_uniform_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_uniform_library" ON creator_uniform_library
  FOR SELECT TO authenticated USING (auth.uid() = creator_id);
CREATE POLICY "insert_own_uniform_library" ON creator_uniform_library
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "update_own_uniform_library" ON creator_uniform_library
  FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "delete_own_uniform_library" ON creator_uniform_library
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);


-- ── 5. Storage bucket ─────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uniform-previews',
  'uniform-previews',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "read_uniform_preview_objects" ON storage.objects
  FOR SELECT USING (bucket_id = 'uniform-previews');
CREATE POLICY "upload_uniform_preview_objects" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'uniform-previews');
CREATE POLICY "update_uniform_preview_objects" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'uniform-previews');
CREATE POLICY "delete_uniform_preview_objects" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'uniform-previews');
