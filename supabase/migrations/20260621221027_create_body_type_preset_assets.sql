-- engine_body_type_preset_assets
-- Body reference card images for AP-001 Body Type selection.
-- Images show physique/silhouette from neck down — no face, no identity cues.
-- Same generation pipeline as engine_appearance_preset_assets.

-- ── Storage bucket ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'body-type-presets',
  'body-type-presets',
  true,
  5242880,
  ARRAY['image/jpeg','image/jpg','image/webp','image/png']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public_read_body_type_presets" ON storage.objects
  FOR SELECT USING (bucket_id = 'body-type-presets');

CREATE POLICY "service_write_body_type_presets" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'body-type-presets');

CREATE POLICY "service_update_body_type_presets" ON storage.objects
  FOR UPDATE USING (bucket_id = 'body-type-presets');

-- ── Body type preset assets table ─────────────────────────────────────────────

CREATE TABLE engine_body_type_preset_assets (
  preset_id          text        PRIMARY KEY,   -- 'BT-001' … 'BT-005'
  body_type_name     text        NOT NULL,       -- display name: 'Slim', 'Athletic' …
  body_type_value    text        NOT NULL,       -- stored in creator_appearance_profiles.body_type
  generation_prompt  text        NOT NULL DEFAULT '',
  image_url          text,
  storage_path       text,
  is_generated       boolean     NOT NULL DEFAULT false,
  sort_order         integer     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE engine_body_type_preset_assets IS
  'Body reference card assets for AP-001. Images show physique from neck down — '
  'face outside frame, no identity cues. Separate from face/identity presets. '
  'AP-001 combines Face Blueprint + Body Blueprint + Clothing + Accessories at generation time.';

ALTER TABLE engine_body_type_preset_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_body_type_preset_assets" ON engine_body_type_preset_assets
  FOR SELECT TO authenticated USING (true);

-- ── Seed: BT-001 through BT-005 ──────────────────────────────────────────────

INSERT INTO engine_body_type_preset_assets
  (preset_id, body_type_name, body_type_value, generation_prompt, sort_order)
VALUES
  (
    'BT-001', 'Slim', 'Slim',
    'Ultra realistic professional fashion photography, adult woman, slim, lean, elegant proportions physique, premium luxury swimwear, full body visible from neck down, face outside frame, body type showcase reference card, elegant posture, studio quality lighting, clean luxury background, emphasis on physique, silhouette and proportions, photorealistic, highly detailed skin and fabric textures, premium commercial photography, shallow depth of field, luxury aesthetic, no facial features visible, no identity cues, no text, portrait orientation',
    1
  ),
  (
    'BT-002', 'Athletic', 'Athletic',
    'Ultra realistic professional fashion photography, adult woman, athletic, toned physique, premium luxury swimwear, full body visible from neck down, face outside frame, body type showcase reference card, elegant posture, studio quality lighting, clean luxury background, emphasis on physique, silhouette and proportions, photorealistic, highly detailed skin and fabric textures, premium commercial photography, shallow depth of field, luxury aesthetic, no facial features visible, no identity cues, no text, portrait orientation',
    2
  ),
  (
    'BT-003', 'Curvy', 'Curvy',
    'Ultra realistic professional fashion photography, adult woman, curvy feminine physique, premium luxury swimwear, full body visible from neck down, face outside frame, body type showcase reference card, elegant posture, studio quality lighting, clean luxury background, emphasis on physique, silhouette and proportions, photorealistic, highly detailed skin and fabric textures, premium commercial photography, shallow depth of field, luxury aesthetic, no facial features visible, no identity cues, no text, portrait orientation',
    3
  ),
  (
    'BT-004', 'Petite', 'Petite',
    'Ultra realistic professional fashion photography, adult woman, petite feminine physique, premium luxury swimwear, full body visible from neck down, face outside frame, body type showcase reference card, elegant posture, studio quality lighting, clean luxury background, emphasis on physique, silhouette and proportions, photorealistic, highly detailed skin and fabric textures, premium commercial photography, shallow depth of field, luxury aesthetic, no facial features visible, no identity cues, no text, portrait orientation',
    4
  ),
  (
    'BT-005', 'Voluptuous', 'Voluptuous',
    'Ultra realistic professional fashion photography, adult woman, voluptuous feminine physique, premium luxury swimwear, full body visible from neck down, face outside frame, body type showcase reference card, elegant posture, studio quality lighting, clean luxury background, emphasis on physique, silhouette and proportions, photorealistic, highly detailed skin and fabric textures, premium commercial photography, shallow depth of field, luxury aesthetic, no facial features visible, no identity cues, no text, portrait orientation',
    5
  );
