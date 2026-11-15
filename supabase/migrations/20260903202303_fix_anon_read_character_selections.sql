-- Allow anon (client dashboard) to read character selections for content-master creators
CREATE POLICY "anon_select_master_selections"
  ON character_studio_v2_selections FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM creators c
      WHERE c.id = character_studio_v2_selections.creator_id
        AND c.is_content_master = true
    )
  );
