-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3A.1 — Mother Creator → AI Generated Master AI Identity
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Add status + prompt_schema to master_ai_characters ──────────────────

ALTER TABLE master_ai_characters
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived'));

ALTER TABLE master_ai_characters
  ADD COLUMN IF NOT EXISTS prompt_schema jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_master_ai_characters_status
  ON master_ai_characters (status);

-- ── 2. Create prompt_field_options table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS prompt_field_options (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name   text NOT NULL,
  option_value text NOT NULL,
  sort_order   int  NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (field_name, option_value)
);

ALTER TABLE prompt_field_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_prompt_field_options"
  ON prompt_field_options FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "insert_prompt_field_options"
  ON prompt_field_options FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE INDEX IF NOT EXISTS idx_prompt_field_options_field_name
  ON prompt_field_options (field_name, sort_order);

-- ── 3. Seed initial dropdown values ─────────────────────────────────────────

INSERT INTO prompt_field_options (field_name, option_value, sort_order, created_by)
VALUES
  -- ethnicity
  ('ethnicity', 'East Asian', 1, NULL),
  ('ethnicity', 'Japanese', 2, NULL),
  ('ethnicity', 'Korean', 3, NULL),
  ('ethnicity', 'Chinese', 4, NULL),
  ('ethnicity', 'Indian', 5, NULL),
  ('ethnicity', 'Southeast Asian', 6, NULL),
  ('ethnicity', 'Caucasian', 7, NULL),
  ('ethnicity', 'Latina', 8, NULL),
  ('ethnicity', 'Middle Eastern', 9, NULL),
  ('ethnicity', 'African', 10, NULL),
  ('ethnicity', 'Mixed', 11, NULL),
  -- age
  ('age', '18-22', 1, NULL),
  ('age', '23-27', 2, NULL),
  ('age', '28-32', 3, NULL),
  ('age', '33-37', 4, NULL),
  ('age', '38-42', 5, NULL),
  ('age', '43-50', 6, NULL),
  ('age', '50+', 7, NULL),
  -- hair
  ('hair', 'Long wavy reddish-brown', 1, NULL),
  ('hair', 'Long straight black', 2, NULL),
  ('hair', 'Short blonde', 3, NULL),
  ('hair', 'Long curly blonde', 4, NULL),
  ('hair', 'Medium length brown', 5, NULL),
  ('hair', 'Short black bob', 6, NULL),
  ('hair', 'Long red', 7, NULL),
  ('hair', 'Medium wavy auburn', 8, NULL),
  ('hair', 'Long platinum blonde', 9, NULL),
  ('hair', 'Short dark brown', 10, NULL),
  ('hair', 'Long dark brown with highlights', 11, NULL),
  -- face
  ('face', 'Oval face with high cheekbones', 1, NULL),
  ('face', 'Round face with soft features', 2, NULL),
  ('face', 'Heart-shaped face with delicate jaw', 3, NULL),
  ('face', 'Square face with strong jaw', 4, NULL),
  ('face', 'Diamond face with angular features', 5, NULL),
  ('face', 'Soft feminine features with full lips', 6, NULL),
  ('face', 'Sharp features with defined nose', 7, NULL),
  ('face', 'Youthful face with large eyes', 8, NULL),
  -- skin_type
  ('skin_type', 'Fair porcelain', 1, NULL),
  ('skin_type', 'Fair with freckles', 2, NULL),
  ('skin_type', 'Light olive', 3, NULL),
  ('skin_type', 'Olive', 4, NULL),
  ('skin_type', 'Tan', 5, NULL),
  ('skin_type', 'Medium brown', 6, NULL),
  ('skin_type', 'Dark brown', 7, NULL),
  ('skin_type', 'Deep ebony', 8, NULL),
  ('skin_type', 'Smooth and glowing', 9, NULL),
  -- body
  ('body', 'Slim and petite', 1, NULL),
  ('body', 'Slim athletic', 2, NULL),
  ('body', 'Hourglass figure', 3, NULL),
  ('body', 'Curvy', 4, NULL),
  ('body', 'Tall and slender', 5, NULL),
  ('body', 'Athletic and toned', 6, NULL),
  ('body', 'Voluptuous', 7, NULL),
  ('body', 'Muscular', 8, NULL),
  -- breasts
  ('breasts', 'Small', 1, NULL),
  ('breasts', 'Medium', 2, NULL),
  ('breasts', 'Large', 3, NULL),
  ('breasts', 'Natural', 4, NULL),
  ('breasts', 'Perky', 5, NULL),
  -- clothing
  ('clothing', 'Black silk slip dress', 1, NULL),
  ('clothing', 'White lace lingerie', 2, NULL),
  ('clothing', 'Casual jeans and t-shirt', 3, NULL),
  ('clothing', 'Elegant evening gown', 4, NULL),
  ('clothing', 'Business attire', 5, NULL),
  ('clothing', 'Cozy sweater and skirt', 6, NULL),
  ('clothing', 'Athletic wear', 7, NULL),
  ('clothing', 'Summer dress', 8, NULL),
  ('clothing', 'Leather jacket and boots', 9, NULL),
  -- pose
  ('pose', 'Standing confidently facing camera', 1, NULL),
  ('pose', 'Sitting elegantly with legs crossed', 2, NULL),
  ('pose', 'Leaning against wall', 3, NULL),
  ('pose', 'Walking toward camera', 4, NULL),
  ('pose', 'Looking over shoulder', 5, NULL),
  ('pose', 'Hands on hips', 6, NULL),
  ('pose', 'Sitting on floor', 7, NULL),
  ('pose', 'Dynamic action pose', 8, NULL),
  -- expression
  ('expression', 'Soft smile', 1, NULL),
  ('expression', 'Confident smirk', 2, NULL),
  ('expression', 'Serious and intense', 3, NULL),
  ('expression', 'Playful grin', 4, NULL),
  ('expression', 'Surprised', 5, NULL),
  ('expression', 'Seductive gaze', 6, NULL),
  ('expression', 'Calm and serene', 7, NULL),
  ('expression', 'Joyful laugh', 8, NULL),
  -- action
  ('action', 'Standing still', 1, NULL),
  ('action', 'Walking', 2, NULL),
  ('action', 'Running', 3, NULL),
  ('action', 'Dancing', 4, NULL),
  ('action', 'Reading', 5, NULL),
  ('action', 'Looking at phone', 6, NULL),
  ('action', 'Drinking coffee', 7, NULL),
  ('action', 'Stretching', 8, NULL),
  -- partner
  ('partner', 'None', 1, NULL),
  ('partner', 'Male partner', 2, NULL),
  ('partner', 'Female partner', 3, NULL),
  ('partner', 'Multiple partners', 4, NULL),
  -- camera_angle
  ('camera_angle', 'Eye level', 1, NULL),
  ('camera_angle', 'Low angle looking up', 2, NULL),
  ('camera_angle', 'High angle looking down', 3, NULL),
  ('camera_angle', 'Birds eye view', 4, NULL),
  ('camera_angle', 'Dutch angle', 5, NULL),
  ('camera_angle', 'Over the shoulder', 6, NULL),
  -- style
  ('style', 'Photorealistic', 1, NULL),
  ('style', 'Cinematic', 2, NULL),
  ('style', 'Anime', 3, NULL),
  ('style', 'Hyperreal', 4, NULL),
  ('style', 'Soft focus', 5, NULL),
  ('style', 'Editorial fashion', 6, NULL),
  ('style', 'Natural documentary', 7, NULL),
  -- lighting
  ('lighting', 'Soft golden hour', 1, NULL),
  ('lighting', 'Studio softbox', 2, NULL),
  ('lighting', 'Natural window light', 3, NULL),
  ('lighting', 'Dramatic side lighting', 4, NULL),
  ('lighting', 'Backlit silhouette', 5, NULL),
  ('lighting', 'Neon ambient', 6, NULL),
  ('lighting', 'Candlelit', 7, NULL),
  ('lighting', 'Overcast diffused', 8, NULL),
  -- atmosphere
  ('atmosphere', 'Warm and inviting', 1, NULL),
  ('atmosphere', 'Mysterious and moody', 2, NULL),
  ('atmosphere', 'Bright and cheerful', 3, NULL),
  ('atmosphere', 'Romantic and intimate', 4, NULL),
  ('atmosphere', 'Energetic and vibrant', 5, NULL),
  ('atmosphere', 'Calm and peaceful', 6, NULL),
  ('atmosphere', 'Dark and edgy', 7, NULL),
  ('atmosphere', 'Luxurious and elegant', 8, NULL),
  -- extra_details
  ('extra_details', 'Tattoos', 1, NULL),
  ('extra_details', 'Jewelry and accessories', 2, NULL),
  ('extra_details', 'Glasses', 3, NULL),
  ('extra_details', 'Makeup details', 4, NULL),
  ('extra_details', 'Scars or marks', 5, NULL),
  ('extra_details', 'Freckles', 6, NULL),
  ('extra_details', 'Nail polish', 7, NULL),
  ('extra_details', 'Body glitter', 8, NULL)
ON CONFLICT (field_name, option_value) DO NOTHING;
