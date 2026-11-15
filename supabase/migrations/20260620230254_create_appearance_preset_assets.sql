-- engine_appearance_preset_assets
-- Stores per-preset metadata, generation prompts, and generated image URLs.
-- AP-001 reads from this table to display preview cards.
-- image_url is null until generate-appearance-preview edge function is called.
-- AP-001 falls back to gradient placeholder when image_url is null.

-- ── Storage bucket ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'appearance-presets',
  'appearance-presets',
  true,
  5242880,  -- 5 MB per image
  ARRAY['image/jpeg','image/jpg','image/webp','image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Public read for generated preset preview images
CREATE POLICY "public_read_appearance_presets" ON storage.objects
  FOR SELECT USING (bucket_id = 'appearance-presets');

-- Service role write (edge function uses service key)
CREATE POLICY "service_write_appearance_presets" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'appearance-presets');

CREATE POLICY "service_update_appearance_presets" ON storage.objects
  FOR UPDATE USING (bucket_id = 'appearance-presets');

-- ── Preset assets table ───────────────────────────────────────────────────────

CREATE TABLE engine_appearance_preset_assets (
  preset_id          text        PRIMARY KEY,
  preset_name        text        NOT NULL,
  preset_tag         text        NOT NULL,
  generation_prompt  text        NOT NULL DEFAULT '',
  image_url          text,
  storage_path       text,
  is_generated       boolean     NOT NULL DEFAULT false,
  sort_order         integer     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE engine_appearance_preset_assets IS
  'Platform-level appearance preset definitions. '
  'generation_prompt is sent to fal-ai/flux-pro by the generate-appearance-preview edge function. '
  'image_url is null until generation runs; AP-001 shows gradient placeholder until then.';

ALTER TABLE engine_appearance_preset_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_appearance_preset_assets" ON engine_appearance_preset_assets
  FOR SELECT TO authenticated USING (true);

-- ── Seed: 8 presets ───────────────────────────────────────────────────────────

INSERT INTO engine_appearance_preset_assets
  (preset_id, preset_name, preset_tag, generation_prompt, sort_order)
VALUES
  (
    'APR-001', 'Japanese Style', '#asian_japanese',
    'Ultra realistic studio portrait of an attractive adult Japanese woman, long straight silky black hair, soft facial features, warm natural smile, clear skin, elegant appearance, natural makeup, premium beauty photography, head and shoulders portrait, soft cinematic lighting, shallow depth of field, luxury aesthetic, photorealistic, highly detailed, professional camera quality',
    1
  ),
  (
    'APR-002', 'Korean Style', '#asian_korean',
    'Ultra realistic studio portrait of an attractive adult Korean woman, glossy long dark hair, delicate facial features, radiant skin, modern beauty aesthetic, natural makeup, gentle confident smile, premium beauty photography, head and shoulders portrait, soft cinematic lighting, shallow depth of field, luxury aesthetic, photorealistic, highly detailed, professional camera quality',
    2
  ),
  (
    'APR-003', 'Chinese Style', '#asian_chinese',
    'Ultra realistic studio portrait of an attractive adult Chinese woman, smooth dark hair, elegant facial structure, flawless skin, sophisticated appearance, natural beauty makeup, warm smile, premium beauty photography, head and shoulders portrait, soft cinematic lighting, shallow depth of field, luxury aesthetic, photorealistic, highly detailed, professional camera quality',
    3
  ),
  (
    'APR-004', 'White American', '#white_american',
    'Ultra realistic studio portrait of an attractive adult American woman, blonde hair, bright eyes, healthy glowing skin, confident modern appearance, natural makeup, friendly smile, premium beauty photography, head and shoulders portrait, soft cinematic lighting, shallow depth of field, luxury aesthetic, photorealistic, highly detailed, professional camera quality',
    4
  ),
  (
    'APR-005', 'White Russian', '#white_russian',
    'Ultra realistic studio portrait of an attractive adult Russian woman, long blonde hair, refined facial features, porcelain skin, elegant appearance, natural makeup, confident smile, premium beauty photography, head and shoulders portrait, soft cinematic lighting, shallow depth of field, luxury aesthetic, photorealistic, highly detailed, professional camera quality',
    5
  ),
  (
    'APR-006', 'Indian', '#indian',
    'Ultra realistic studio portrait of an attractive adult Indian woman, long dark hair, expressive eyes, warm skin tone, elegant facial features, natural makeup, confident smile, premium beauty photography, head and shoulders portrait, soft cinematic lighting, shallow depth of field, luxury aesthetic, photorealistic, highly detailed, professional camera quality',
    6
  ),
  (
    'APR-007', 'Black', '#black',
    'Ultra realistic studio portrait of an attractive adult Black woman, beautiful natural features, healthy glowing skin, stylish appearance, natural makeup, warm confident smile, premium beauty photography, head and shoulders portrait, soft cinematic lighting, shallow depth of field, luxury aesthetic, photorealistic, highly detailed, professional camera quality',
    7
  ),
  (
    'APR-008', 'My AI', '#creator_ai',
    '',  -- No generation prompt; creator uploads face references in future phase
    8
  );
