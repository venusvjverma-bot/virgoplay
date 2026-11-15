-- Add body_preset_id to creator_appearance_profiles
-- so we can reference the BT-XXX code alongside body_type_value
ALTER TABLE creator_appearance_profiles
  ADD COLUMN IF NOT EXISTS body_preset_id text;

-- ── engine_ai_identities ────────────────────────────────────────────────────
-- Canonical AI character identity generated from an APR + BT combination.
-- Phase 1: face-swap technique. Future phases add hair, clothing, accessories.

CREATE TABLE engine_ai_identities (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_code             text        NOT NULL,            -- AI-0001, AI-0002 …
  apr_code                  text        NOT NULL,            -- e.g. APR-003
  apr_name                  text,                            -- e.g. Chinese Style
  bt_code                   text        NOT NULL,            -- e.g. BT-003
  bt_name                   text,                            -- e.g. Curvy
  master_identity_image_url text,
  storage_path              text,
  generation_status         text        NOT NULL DEFAULT 'pending'
                            CHECK (generation_status IN ('pending','processing','completed','failed')),
  error_message             text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, identity_code)
);

COMMENT ON TABLE engine_ai_identities IS
  'Canonical Master AI Identity per creator, generated from APR + BT combination. '
  'Becomes the reference identity for Image Library, Scenario Library, Package Library, '
  'Video Library, and AI Companion System.';

ALTER TABLE engine_ai_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_ai_identities" ON engine_ai_identities
  FOR SELECT TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "insert_own_ai_identities" ON engine_ai_identities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "update_own_ai_identities" ON engine_ai_identities
  FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "delete_own_ai_identities" ON engine_ai_identities
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);
