-- Allow anon to read display_name overrides for content-master Customize AI characters.
-- Mirrors the existing anon_select_master_my_ai_overrides policy.
CREATE POLICY "anon_select_master_customize_ai_overrides"
  ON customize_ai_overrides FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM character_studio_v2 csv2
      JOIN creators c ON c.id = csv2.creator_id
      WHERE csv2.id = customize_ai_overrides.character_id
        AND c.is_content_master = true
    )
  );