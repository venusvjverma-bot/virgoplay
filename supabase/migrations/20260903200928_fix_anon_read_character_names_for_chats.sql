-- Fix Character Name display in Client Account → Chats
--
-- The client dashboard uses the anon key (custom client auth, not Supabase auth).
-- character_roles and character_studio_v2 only had SELECT policies for the
-- `authenticated` role (checking auth.uid() = creator_id), so anon queries
-- returned zero rows and the Chats list showed "Unknown Character" / "Unknown Role".
--
-- Add read-only SELECT policies for the anon role on both tables, scoped to
-- content-master creators — the same sharing model already used by the
-- authenticated policy and by the public-test-chat edge function.

CREATE POLICY "anon_select_master_roles"
  ON character_roles FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM creators c
      WHERE c.id = character_roles.creator_id
        AND c.is_content_master = true
    )
  );

CREATE POLICY "anon_select_master_characters"
  ON character_studio_v2 FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM creators c
      WHERE c.id = character_studio_v2.creator_id
        AND c.is_content_master = true
    )
  );
