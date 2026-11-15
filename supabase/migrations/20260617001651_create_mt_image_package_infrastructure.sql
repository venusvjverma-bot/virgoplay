-- MT-IMG-001: Image Package Infrastructure

-- ── Storage bucket ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'image-packages',
  'image-packages',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "read_image_packages" ON storage.objects
  FOR SELECT USING (bucket_id = 'image-packages');

CREATE POLICY "upload_image_packages" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'image-packages');

CREATE POLICY "update_image_packages" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'image-packages');

-- ── Register MT-IMG-001 in engine_package_registry ────────────────────────────

INSERT INTO engine_package_registry (code, label, description, package_group, package_type, parent_code, is_active, sort_order)
VALUES (
  'MT-IMG-001',
  'MT Welcome Image',
  'Welcome image displayed at SEQ-1 of the Massage Therapist beginning stage.',
  'MT',
  'image',
  'MT-BEG-001',
  true,
  1
)
ON CONFLICT (code) DO NOTHING;

-- ── engine_image_packages table ───────────────────────────────────────────────
-- Per-creator image package instances. Each creator generates their own version
-- using their face photo (FF-001) as the appearance reference.

CREATE TABLE engine_image_packages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_code     text        NOT NULL,   -- e.g. MT-IMG-001
  parent_code      text        NOT NULL,   -- e.g. MT-BEG-001
  role_code        text        NOT NULL,   -- e.g. MT-001
  trigger_seq      integer     NOT NULL DEFAULT 1,
  image_url        text,
  storage_path     text,
  source_reference text        NOT NULL DEFAULT 'FF-001',
  prompt           text        NOT NULL DEFAULT '',
  generated_at     timestamptz,
  is_active        boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, package_code)
);

ALTER TABLE engine_image_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_image_packages" ON engine_image_packages
  FOR SELECT TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "insert_own_image_packages" ON engine_image_packages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "update_own_image_packages" ON engine_image_packages
  FOR UPDATE TO authenticated USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "delete_own_image_packages" ON engine_image_packages
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);

-- ── Add image_url to companion_test_messages ──────────────────────────────────

ALTER TABLE companion_test_messages
  ADD COLUMN image_url text DEFAULT NULL;
