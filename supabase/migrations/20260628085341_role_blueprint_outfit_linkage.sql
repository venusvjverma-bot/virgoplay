-- ═══════════════════════════════════════════════════════════════════════════
-- ROLE BLUEPRINT OUTFIT LINKAGE
--
-- Every Role Blueprint must declare the required outfit (dress_code) and any
-- default accessories (accessory_codes) to use during image generation.
--
-- The generation pipeline reads these to:
--   1. Validate that required outfit layers exist before rendering starts.
--   2. Use the dress image as the render base when available (so the outfit
--      is visually present in the generated image).
--   3. Store a complete layer snapshot (dress_id, accessory_ids) in every
--      role_image_library record for versioning and provider migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Add outfit columns to ai_role_blueprints ─────────────────────────────────

ALTER TABLE ai_role_blueprints
  ADD COLUMN dress_code       text,           -- Required outfit for this role (DR-XXX)
  ADD COLUMN accessory_codes  text[]  NOT NULL DEFAULT '{}';  -- Default accessories (ACC-XXX[])

COMMENT ON COLUMN ai_role_blueprints.dress_code IS
  'Required dress code from ai_dress_library. '
  'Must be set before images can be generated for this role. '
  'The generation pipeline fails with "Role outfit not configured." if this is NULL.';

COMMENT ON COLUMN ai_role_blueprints.accessory_codes IS
  'Default accessory codes from ai_accessory_library for this role. '
  'Can be empty array for no accessories. Each code resolves to an accessory UUID '
  'stored in role_image_library.accessory_ids.';


-- ── Wire dress codes to existing role blueprints ──────────────────────────────

UPDATE ai_role_blueprints SET dress_code = 'DR-MT-001' WHERE role_code = 'MT-001';
UPDATE ai_role_blueprints SET dress_code = 'DR-GF-001' WHERE role_code = 'GF-001';
UPDATE ai_role_blueprints SET dress_code = 'DR-DF-001' WHERE role_code = 'DF-001';
UPDATE ai_role_blueprints SET dress_code = 'DR-PE-001' WHERE role_code = 'PE-001';
-- RP-001 (Role Player) is scenario-dependent; DR-CAS-001 is the sensible default
UPDATE ai_role_blueprints SET dress_code = 'DR-CAS-001' WHERE role_code = 'RP-001';


-- ── Wire default accessories to role blueprints ───────────────────────────────
-- MT-001: Name badge (professional clinic requirement)
-- PE-001: Elegant Watch + Simple Necklace (luxury escort aesthetic)
-- Others: no accessories by default (can be overridden per-image)

UPDATE ai_role_blueprints SET accessory_codes = ARRAY['ACC-002'] WHERE role_code = 'MT-001';
UPDATE ai_role_blueprints SET accessory_codes = ARRAY['ACC-001', 'ACC-003'] WHERE role_code = 'PE-001';
