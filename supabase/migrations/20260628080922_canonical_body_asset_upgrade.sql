-- ═══════════════════════════════════════════════════════════════════════════
-- CANONICAL BODY ASSET UPGRADE
--
-- Promotes all AI-XXXX-A layers from `reference_only` helpers into fully
-- structured Canonical Body Assets — the permanent foundation of every future
-- image, video, animation, package, and role appearance for each identity.
--
-- Changes:
--   1. Extend layer_status CHECK constraint to include 'canonical'
--   2. Add is_canonical_body fast-lookup column
--   3. Upgrade all body layer records with structured metadata
--   4. Upgrade base_clothing layer metadata for consistency
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Extend layer_status ────────────────────────────────────────────────────
ALTER TABLE ai_identity_layers
  DROP CONSTRAINT ai_identity_layers_layer_status_check;

ALTER TABLE ai_identity_layers
  ADD CONSTRAINT ai_identity_layers_layer_status_check
  CHECK (layer_status IN ('reference_only','canonical','generating','generated','failed'));

COMMENT ON COLUMN ai_identity_layers.layer_status IS
  'reference_only = pointer to source asset, no standalone image. '
  'canonical      = promoted to permanent authoritative body asset. '
  'generating     = standalone image being produced. '
  'generated      = standalone image available at image_url. '
  'failed         = generation error.';

-- ── 2. is_canonical_body fast-lookup ─────────────────────────────────────────
ALTER TABLE ai_identity_layers
  ADD COLUMN IF NOT EXISTS is_canonical_body boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN ai_identity_layers.is_canonical_body IS
  'True for the AI-XXXX-A body layer. '
  'Every generation pipeline must read this layer first. '
  'Nothing recreates body geometry independently once this layer exists.';

CREATE INDEX IF NOT EXISTS idx_layers_canonical_body
  ON ai_identity_layers (identity_id)
  WHERE is_canonical_body = true;

-- ── 3. Promote all body layers to Canonical Body Asset ───────────────────────
-- Skin tone is derived from APR code.
-- Body proportions are derived from BT code.
-- The generation_pipeline documents the full composition order for every future render.

UPDATE ai_identity_layers l
SET
  layer_status      = 'canonical',
  is_canonical_body = true,
  layer_name        = 'Canonical Body Asset — ' || m.bt_name,

  metadata = jsonb_build_object(

    -- ── Identity ────────────────────────────────────────────────────────────
    'canonical',           true,
    'body_asset_version',  1,
    'role',                'Permanent body asset for this identity. Every image, video, animation, package, and role appearance must originate from this body definition. Body geometry is never recreated independently once this layer exists.',

    'identity', jsonb_build_object(
      'identity_code',    m.identity_code,
      'linked_apr_code',  m.apr_code,
      'linked_apr_name',  m.apr_name,
      'linked_bt_code',   m.bt_code,
      'linked_bt_name',   m.bt_name,
      'version',          1
    ),

    -- ── Physical profile ────────────────────────────────────────────────────
    'physical_profile', jsonb_build_object(
      'body_type',  m.bt_name,
      'creator_age', NULL,

      'height', CASE m.bt_code
        WHEN 'BT-001' THEN 'Medium to tall'
        WHEN 'BT-002' THEN 'Medium'
        WHEN 'BT-003' THEN 'Medium'
        WHEN 'BT-004' THEN 'Short to medium'
        WHEN 'BT-005' THEN 'Medium to tall'
        ELSE 'Medium'
      END,

      'skin_tone', CASE m.apr_code
        WHEN 'APR-001' THEN 'Light, warm ivory — East Asian Japanese complexion'
        WHEN 'APR-002' THEN 'Light, cool porcelain — East Asian Korean complexion'
        WHEN 'APR-003' THEN 'Light to medium, warm beige — East Asian Chinese complexion'
        WHEN 'APR-004' THEN 'Light, neutral fair — Western American complexion'
        WHEN 'APR-005' THEN 'Light, cool rose-beige — Eastern European Russian complexion'
        WHEN 'APR-006' THEN 'Medium to dark, warm golden-brown — South Asian Indian complexion'
        WHEN 'APR-007' THEN 'Medium to deep, rich brown — African American complexion'
        WHEN 'APR-008' THEN 'Creator-defined — populated when custom APR is configured'
        ELSE 'Unspecified'
      END,

      'proportions', CASE m.bt_code
        WHEN 'BT-001' THEN '{"frame":"Slim elongated","shoulders":"Narrow","waist":"Slim","hips":"Narrow to slim","posture":"Upright lean"}'::jsonb
        WHEN 'BT-002' THEN '{"frame":"Athletic muscular","shoulders":"Broad defined","waist":"Narrow defined","hips":"Athletic firm","posture":"Strong upright"}'::jsonb
        WHEN 'BT-003' THEN '{"frame":"Full hourglass curves","shoulders":"Medium","waist":"Defined narrow","hips":"Full wide","posture":"Natural relaxed"}'::jsonb
        WHEN 'BT-004' THEN '{"frame":"Petite compact","shoulders":"Narrow petite","waist":"Slim narrow","hips":"Petite","posture":"Light upright"}'::jsonb
        WHEN 'BT-005' THEN '{"frame":"Full plus-size","shoulders":"Full wide","waist":"Full soft","hips":"Full wide","posture":"Natural confident"}'::jsonb
        ELSE '{"frame":"Standard","shoulders":"Medium","waist":"Medium","hips":"Medium","posture":"Natural"}'::jsonb
      END
    ),

    -- ── Generation pipeline ─────────────────────────────────────────────────
    -- This documents the full composition order for every render this identity produces.
    -- The Creator Portal owns this pipeline definition.
    -- The rendering provider receives the composed appearance and renders only.
    'generation_pipeline', jsonb_build_object(

      'position',          1,
      'is_canonical_body', true,
      'provider_independent', true,
      'provider_note',     'Body definition is rendering-provider agnostic. Compatible with FAL, Stable Diffusion, ComfyUI, and any future AI rendering system.',

      'description', 'Step 1 of every generation pipeline. All images, videos, animations, packages, and role appearances start from this body asset.',

      'pipeline', jsonb_build_array(
        jsonb_build_object('step', 1, 'type', 'identity',    'code', m.identity_code,        'label', 'Master AI Identity',      'role', 'Identity container and reference point'),
        jsonb_build_object('step', 2, 'type', 'body',        'code', l.layer_code,            'label', 'Canonical Body Asset',    'role', 'THIS LAYER — permanent body definition. Never regenerated independently.'),
        jsonb_build_object('step', 3, 'type', 'clothing',    'code', m.identity_code || '-B', 'label', 'Base Clothing',           'role', 'Default clothing — fully replaceable without touching the body asset'),
        jsonb_build_object('step', 4, 'type', 'dress',       'code', 'DR-*',                  'label', 'Dress Layer',             'role', 'Role-specific or custom outfit from Dress Library'),
        jsonb_build_object('step', 5, 'type', 'accessory',   'code', 'ACC-*',                 'label', 'Accessory Layer',         'role', 'Watch, jewellery, eyewear, badge — independent from all other layers'),
        jsonb_build_object('step', 6, 'type', 'blueprint',   'code', 'MT-001 / GF-001 etc.',  'label', 'Role Blueprint',          'role', 'Environment, camera angle, pose, lighting, expression'),
        jsonb_build_object('step', 7, 'type', 'provider',    'code', 'fal-ai | SD | ComfyUI', 'label', 'Rendering Provider',      'role', 'Receives the composed appearance definition and renders the final image'),
        jsonb_build_object('step', 8, 'type', 'output',      'code', NULL,                    'label', 'Final Asset',             'role', 'Generated image or video output')
      )
    ),

    -- ── Source references ────────────────────────────────────────────────────
    'source', jsonb_build_object(
      'bt_image_url',  (SELECT image_url FROM engine_body_type_preset_assets  WHERE preset_id = m.bt_code  LIMIT 1),
      'apr_image_url', (SELECT image_url FROM engine_appearance_preset_assets WHERE preset_id = m.apr_code LIMIT 1),
      'composition_technique', 'face_swap_v1',
      'phase', 1,
      'note',  'Body asset represents body geometry and proportions only. Role clothing is defined by Dress Library layers, not embedded here.'
    )

  ),
  updated_at = now()
FROM master_ai_identities m
WHERE l.identity_id = m.id
  AND l.layer_type = 'body';

-- ── 4. Enrich base_clothing layers ────────────────────────────────────────────
-- Less detailed than body, but structured for consistency.
UPDATE ai_identity_layers l
SET
  layer_name = 'Base Clothing — ' || m.bt_name || ' default',
  metadata = jsonb_build_object(
    'canonical',          false,
    'clothing_layer_version', 1,
    'role',               'Default clothing from BT preset reference. Fully independent from the body asset. Can be replaced, coloured, or deleted without modifying AI-XXXX-A.',
    'identity', jsonb_build_object(
      'identity_code',   m.identity_code,
      'linked_bt_code',  m.bt_code,
      'linked_bt_name',  m.bt_name
    ),
    'replaceability', jsonb_build_object(
      'colour_change',   true,
      'texture_change',  true,
      'material_change', true,
      'replacement',     true,
      'deletion',        true,
      'note',            'Any clothing change must never regenerate AI-XXXX-A (the body asset).'
    ),
    'source', jsonb_build_object(
      'bt_image_url',  (SELECT image_url FROM engine_body_type_preset_assets WHERE preset_id = m.bt_code LIMIT 1),
      'clothing_ref',  'Default clothing worn in BT preset reference image',
      'phase',         1
    )
  ),
  updated_at = now()
FROM master_ai_identities m
WHERE l.identity_id = m.id
  AND l.layer_type = 'base_clothing';
