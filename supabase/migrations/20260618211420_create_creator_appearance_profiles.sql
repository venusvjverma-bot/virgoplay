-- creator_appearance_profiles
-- Stores AP-001 role-linked appearance blueprints per creator.
-- One row per (creator_id, profile_code). Profile_code = 'AP-001' for V1.
-- role_code is plain text (not FK) — supports future roles not yet in engine_package_registry.

CREATE TABLE creator_appearance_profiles (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_code          text        NOT NULL DEFAULT 'AP-001',
  -- Role linkage
  role_code             text,
  -- AI model preset
  appearance_preset_id  text,
  appearance_tag        text,
  appearance_name       text,
  -- Physical appearance
  hair_style            text,
  body_type             text,
  -- Wardrobe / accessories (multi-select)
  clothing_tags         text[]      NOT NULL DEFAULT '{}',
  accessory_tags        text[]      NOT NULL DEFAULT '{}',
  -- Generation control
  visual_consistency    text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, profile_code)
);

COMMENT ON TABLE creator_appearance_profiles IS
  'Per-creator appearance blueprint (AP-001 in V1). '
  'Stores role linkage, AI model preset, physical traits, wardrobe, and visual consistency. '
  'Creator uploads and image generation are connected in future phases.';

COMMENT ON COLUMN creator_appearance_profiles.appearance_preset_id IS
  'AI model preset code e.g. APR-001 through APR-008.';
COMMENT ON COLUMN creator_appearance_profiles.visual_consistency IS
  'Strict | Balanced | Creative — controls how closely image generation follows the blueprint.';

ALTER TABLE creator_appearance_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_appearance_profiles" ON creator_appearance_profiles
  FOR SELECT TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "insert_own_appearance_profiles" ON creator_appearance_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "update_own_appearance_profiles" ON creator_appearance_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "delete_own_appearance_profiles" ON creator_appearance_profiles
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);
