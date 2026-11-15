-- Fix Character Name in Client Account → Chats
--
-- Issue 1: The anon_select_master_selections policy on character_studio_v2_selections
-- checks if the selection's creator_id (the child creator) is a content master.
-- Child creators are NOT content masters, so the anon key (used by the client
-- dashboard) gets zero rows and the Chats list shows "Unknown Character".
-- Fix: check the selected CHARACTER's owner instead.
--
-- Issue 2: character_studio_v2_my_ai_overrides has no anon SELECT policy,
-- so the client dashboard cannot read display_name overrides. Add one scoped
-- to content-master characters (same sharing model as the other anon policies).

-- ── Fix 1: Replace the broken anon policy on selections ──
DROP POLICY IF EXISTS "anon_select_master_selections" ON character_studio_v2_selections;

CREATE POLICY "anon_select_master_selections"
  ON character_studio_v2_selections FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM character_studio_v2 csv2
      JOIN creators c ON c.id = csv2.creator_id
      WHERE csv2.id = character_studio_v2_selections.character_id
        AND c.is_content_master = true
    )
  );

-- ── Fix 2: Allow anon to read display_name overrides for content-master characters ──
CREATE POLICY "anon_select_master_my_ai_overrides"
  ON character_studio_v2_my_ai_overrides FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM character_studio_v2 csv2
      JOIN creators c ON c.id = csv2.creator_id
      WHERE csv2.id = character_studio_v2_my_ai_overrides.character_id
        AND c.is_content_master = true
    )
  );