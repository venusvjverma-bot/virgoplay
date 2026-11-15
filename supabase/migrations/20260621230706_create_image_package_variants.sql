
CREATE TABLE IF NOT EXISTS engine_image_package_variants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_code        text NOT NULL UNIQUE,
  source_package_code text NOT NULL,
  face_preset_id      text,
  body_preset_id      text,
  image_url           text,
  storage_path        text,
  is_generated        boolean NOT NULL DEFAULT false,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engine_image_package_variants ENABLE ROW LEVEL SECURITY;

-- Service role only — these are internal experiment outputs
CREATE POLICY "variants_service_select" ON engine_image_package_variants
  FOR SELECT TO service_role USING (true);
CREATE POLICY "variants_service_insert" ON engine_image_package_variants
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "variants_service_update" ON engine_image_package_variants
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "variants_service_delete" ON engine_image_package_variants
  FOR DELETE TO service_role USING (true);

CREATE INDEX IF NOT EXISTS idx_variants_source_package ON engine_image_package_variants (source_package_code);
CREATE INDEX IF NOT EXISTS idx_variants_face_preset    ON engine_image_package_variants (face_preset_id);
