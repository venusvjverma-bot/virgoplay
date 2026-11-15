/*
# Per-creator My AI image overrides

Allows verified Child Creators to upload their OWN image for the reserved
"My AI" V-card — separate from the Mother Creator's My AI generated image.

The Mother Creator's My AI row lives in character_studio_v2 (shared, read-only
for children). This new table stores a per-creator override: when a Child
Creator uploads an image, it is stored here and displayed as that child's
temporary My AI reference instead of the Mother's image.

Table: character_studio_v2_my_ai_overrides
  - creator_id     UUID  (the child creator who owns this override)
  - character_id   UUID  (the shared My AI row in character_studio_v2)
  - image_url      TEXT  (public URL of the uploaded image)
  - image_path     TEXT  (storage path for cleanup)
  - created_at     TIMESTAMPTZ
  - updated_at     TIMESTAMPTZ

Primary key: (creator_id, character_id) — one override per creator per My AI row.
RLS: enabled — each creator can only read/write their own override row.
*/

CREATE TABLE IF NOT EXISTS character_studio_v2_my_ai_overrides (
  creator_id   UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES character_studio_v2(id) ON DELETE CASCADE,
  image_url    TEXT NOT NULL,
  image_path   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (creator_id, character_id)
);

ALTER TABLE character_studio_v2_my_ai_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_my_ai_override"
  ON character_studio_v2_my_ai_overrides FOR SELECT
  TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "insert_own_my_ai_override"
  ON character_studio_v2_my_ai_overrides FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "update_own_my_ai_override"
  ON character_studio_v2_my_ai_overrides FOR UPDATE
  TO authenticated USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "delete_own_my_ai_override"
  ON character_studio_v2_my_ai_overrides FOR DELETE
  TO authenticated USING (auth.uid() = creator_id);
