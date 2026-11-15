-- ── Production spec columns for ai_dress_library ─────────────────────────────
ALTER TABLE ai_dress_library
  ADD COLUMN IF NOT EXISTS garment_type            text,
  ADD COLUMN IF NOT EXISTS compatible_accessories  text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS compatible_body_blueprints text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS compatible_image_phases text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS compatible_video_scenes text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS animation_ready         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gpu_ready               boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reusable_layer          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS physics_preset          jsonb   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS thumbnail_url           text;

-- ── DR-MT-001 Classic Massage Robe ────────────────────────────────────────────
UPDATE ai_dress_library SET
  dress_name                 = 'Classic Massage Robe',
  garment_type               = 'Luxury Wrap Robe',
  category                   = 'Spa Robe',
  description                = 'Luxury wrap robe in warm beige premium cotton terry. Wide spa collar, deep V neckline, self-tie belt, two front pockets. Suitable for reception, greeting, consultation, walking, and waiting.',
  generation_prompt_fragment = 'luxury wrap spa robe, warm beige premium cotton terry, deep V neckline, wide spa collar, self-tie belt, short sleeves, above knee length, two front pockets, logo on left chest, soft matte texture, relaxed luxury fit, natural draping',
  metadata = jsonb_build_object(
    'fabric',            'Premium Cotton Terry',
    'material',          'Soft Cotton Blend',
    'primary_color',     'Warm Beige',
    'secondary_color',   'Natural Cream',
    'texture',           'Soft Matte',
    'fit',               'Relaxed Luxury',
    'length',            'Above Knee',
    'sleeves',           'Short Sleeve',
    'neckline',          'Deep V',
    'neck_width',        'Wide',
    'collar',            'Wide Spa Collar',
    'waist_style',       'Self Tie Belt',
    'back',              'Smooth Panel',
    'pockets',           'Two Front',
    'logo',              'Left Chest',
    'purpose',           ARRAY['Reception', 'Greeting', 'Consultation', 'Walking', 'Waiting']
  ),
  compatible_accessories   = ARRAY['ACC-002', 'ACC-004'],
  compatible_body_blueprints = ARRAY['BT-001', 'BT-002', 'BT-003'],
  compatible_image_phases  = ARRAY['beginning', 'middle', 'ending'],
  compatible_video_scenes  = ARRAY['reception', 'greeting', 'consultation'],
  animation_ready          = true,
  gpu_ready                = true,
  reusable_layer           = true,
  physics_preset = jsonb_build_object(
    'fabric_weight', 'light',
    'fold_type',     'soft_folds',
    'draping',       'natural',
    'simulation',    'gravity'
  ),
  updated_at = now()
WHERE dress_code = 'DR-MT-001';

-- ── DR-MT-002 Professional Spa Uniform ────────────────────────────────────────
UPDATE ai_dress_library SET
  dress_name                 = 'Professional Spa Uniform',
  garment_type               = 'Spa Dress Uniform',
  category                   = 'Massage Uniform',
  description                = 'Tailored spa dress uniform in white performance stretch textile. Broad deep V neckline, mid-thigh length, dual utility pockets, professional straight cut back. For treatment, consultation, and professional work.',
  generation_prompt_fragment = 'professional spa dress uniform, white performance stretch medical textile, broad deep V neckline, short sleeves, mid-thigh length, tailored slim fit, dual utility pockets, logo on left chest, smooth texture, minimal movement',
  metadata = jsonb_build_object(
    'fabric',            'Performance Stretch',
    'material',          'Professional Medical Textile',
    'primary_color',     'White',
    'secondary_color',   'Light Beige',
    'texture',           'Smooth',
    'fit',               'Tailored Slim Fit',
    'length',            'Mid Thigh',
    'sleeves',           'Short',
    'neckline',          'Deep V',
    'neck_width',        'Broad',
    'waist_style',       'Tailored',
    'back',              'Professional Straight Cut',
    'pockets',           'Dual Utility',
    'logo',              'Left Chest',
    'purpose',           ARRAY['Treatment', 'Consultation', 'Professional Work']
  ),
  compatible_accessories   = ARRAY['ACC-002', 'ACC-005'],
  compatible_body_blueprints = ARRAY['BT-001', 'BT-002', 'BT-003'],
  compatible_image_phases  = ARRAY['beginning', 'middle', 'ending'],
  compatible_video_scenes  = ARRAY['treatment', 'consultation'],
  animation_ready          = true,
  gpu_ready                = true,
  reusable_layer           = true,
  physics_preset = jsonb_build_object(
    'fabric_weight', 'medium',
    'fold_type',     'minimal',
    'draping',       'structured',
    'simulation',    'minimal_movement'
  ),
  updated_at = now()
WHERE dress_code = 'DR-MT-002';

-- ── DR-MT-003 Deluxe Luxury Spa Robe ──────────────────────────────────────────
UPDATE ai_dress_library SET
  dress_name                 = 'Deluxe Luxury Spa Robe',
  garment_type               = 'Premium Waffle Robe',
  category                   = 'Spa Robe',
  description                = 'Premium waffle robe in cream luxury waffle cotton. Wide premium collar, deep V neckline, wide luxury belt, half sleeves, knee length with luxury patch pockets. For VIP, luxury packages, and premium welcome.',
  generation_prompt_fragment = 'premium waffle spa robe, cream luxury waffle cotton, deep V neckline, wide premium collar, wide luxury belt, half sleeves, knee length, luxury patch pockets, heavy fabric natural folds, luxury draping, relaxed luxury fit',
  metadata = jsonb_build_object(
    'fabric',            'Luxury Waffle Cotton',
    'material',          'Premium Waffle Weave',
    'primary_color',     'Cream',
    'secondary_color',   'Warm Beige',
    'texture',           'Premium Waffle',
    'fit',               'Relaxed Luxury',
    'length',            'Knee Length',
    'sleeves',           'Half Sleeve',
    'neckline',          'Deep V',
    'neck_width',        'Wide Premium Collar',
    'waist_style',       'Wide Luxury Belt',
    'pockets',           'Luxury Patch Pockets',
    'purpose',           ARRAY['VIP', 'Luxury Package', 'Premium Welcome']
  ),
  compatible_accessories   = ARRAY['ACC-002', 'ACC-006'],
  compatible_body_blueprints = ARRAY['BT-001', 'BT-002', 'BT-003'],
  compatible_image_phases  = ARRAY['beginning', 'ending'],
  compatible_video_scenes  = ARRAY['vip_welcome', 'luxury_reception'],
  animation_ready          = true,
  gpu_ready                = true,
  reusable_layer           = true,
  physics_preset = jsonb_build_object(
    'fabric_weight', 'heavy',
    'fold_type',     'natural_folds',
    'draping',       'luxury',
    'simulation',    'gravity'
  ),
  updated_at = now()
WHERE dress_code = 'DR-MT-003';

-- ── DR-MT-004 Therapist Clinic Uniform ────────────────────────────────────────
UPDATE ai_dress_library SET
  dress_name                 = 'Therapist Clinic Uniform',
  garment_type               = 'Professional Clinic Uniform',
  category                   = 'Massage Uniform',
  description                = 'Structured professional clinic uniform in white medical stretch textile with grey accents. Mandarin collar, moderately open front, large utility pockets, logo on left chest. For sports therapy, medical massage, and clinic consultation.',
  generation_prompt_fragment = 'professional clinic uniform dress, white medical stretch textile, grey accents, mandarin collar, moderately open front, short sleeves, mid-thigh length, structured tailored fit, large utility pockets, logo on left chest, professional smooth texture',
  metadata = jsonb_build_object(
    'fabric',            'Medical Stretch Textile',
    'material',          'Professional Medical Stretch',
    'primary_color',     'White',
    'secondary_color',   'Grey',
    'texture',           'Professional Smooth',
    'fit',               'Structured Tailored',
    'length',            'Mid Thigh',
    'sleeves',           'Short',
    'neckline',          'Mandarin',
    'collar',            'Mandarin',
    'front_opening',     'Moderately Open',
    'pockets',           'Large Utility',
    'logo',              'Left Chest',
    'purpose',           ARRAY['Sports Therapy', 'Medical Massage', 'Clinic Consultation']
  ),
  compatible_accessories   = ARRAY['ACC-002', 'ACC-007'],
  compatible_body_blueprints = ARRAY['BT-001', 'BT-002', 'BT-003'],
  compatible_image_phases  = ARRAY['beginning', 'middle', 'ending'],
  compatible_video_scenes  = ARRAY['clinic', 'sports_therapy', 'consultation'],
  animation_ready          = true,
  gpu_ready                = true,
  reusable_layer           = true,
  physics_preset = jsonb_build_object(
    'fabric_weight', 'medium',
    'fold_type',     'structured',
    'draping',       'minimal',
    'simulation',    'minimal_movement'
  ),
  updated_at = now()
WHERE dress_code = 'DR-MT-004';
