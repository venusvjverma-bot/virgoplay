/*
# Fix: Authenticated Chat Library read access for child creators

## Problem
The Chat Library page (/chat-library) loads character identity data (name, age,
country, display_name, role image) from four tables. Each table has:
  - an owner-scoped `TO authenticated` SELECT policy (auth.uid() = creator_id)
  - a Chat Library-scoped `TO anon` SELECT policy

When a creator is logged OUT, the anon policies return all published Chat Library
data correctly. When a creator is logged IN as a Child Creator, only the
owner-scoped authenticated policies apply — so the creator can only read their
own rows. Other creators' character names, images, and metadata disappear,
showing "Unknown" and missing thumbnails.

## Fix
Add a new `TO authenticated` SELECT policy on each of the four tables that
mirrors the EXACT same Chat Library eligibility condition already used by the
existing `TO anon` policy. This does NOT broaden access — it provides the same
publicly-available Chat Library data to authenticated creators that anon
already receives. All existing owner-scoped authenticated policies remain
unchanged.

## Tables and policies added

1. role_image_productions
   - New policy: "authenticated_select_role_images_for_chat_library"
   - Condition: role_id EXISTS in chat_library_listings (same as anon policy)

2. character_studio_v2_selections
   - New policy: "authenticated_select_chat_library_selections"
   - Condition: selected character belongs to a content-master creator
     (same as anon policy "anon_select_master_selections" from migration
     20260903220926)

3. character_studio_v2_my_ai_overrides
   - New policy: "authenticated_select_chat_library_my_ai_overrides"
   - Condition: override's character belongs to a content-master creator
     (same as anon policy "anon_select_master_my_ai_overrides" from migration
     20260903220926)

4. customize_ai_overrides
   - New policy: "authenticated_select_chat_library_customize_ai_overrides"
   - Condition: override's character belongs to a content-master creator
     (same as anon policy "anon_select_master_customize_ai_overrides" from
     migration 20260916145542)

## Security
- No existing policies are removed or weakened.
- The new authenticated policies expose ONLY data that is already publicly
  readable through the existing anon Chat Library policies — no new data is
  exposed.
- Owner-scoped authenticated policies remain in place and unchanged.
- Private/non-published creator data remains inaccessible to other creators.
- No changes to INSERT/UPDATE/DELETE policies on any table.
*/

-- ── 1. role_image_productions ──
-- Existing anon policy: "anon_select_role_images_for_chat_library"
-- Condition: role_id EXISTS in chat_library_listings
DROP POLICY IF EXISTS "authenticated_select_role_images_for_chat_library" ON role_image_productions;
CREATE POLICY "authenticated_select_role_images_for_chat_library"
ON role_image_productions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM chat_library_listings cll
    WHERE cll.role_id = role_image_productions.role_id
  )
);

-- ── 2. character_studio_v2_selections ──
-- Existing anon policy: "anon_select_master_selections" (migration 20260903220926)
-- Condition: selected character belongs to a content-master creator
DROP POLICY IF EXISTS "authenticated_select_chat_library_selections" ON character_studio_v2_selections;
CREATE POLICY "authenticated_select_chat_library_selections"
  ON character_studio_v2_selections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM character_studio_v2 csv2
      JOIN creators c ON c.id = csv2.creator_id
      WHERE csv2.id = character_studio_v2_selections.character_id
        AND c.is_content_master = true
    )
  );

-- ── 3. character_studio_v2_my_ai_overrides ──
-- Existing anon policy: "anon_select_master_my_ai_overrides" (migration 20260903220926)
-- Condition: override's character belongs to a content-master creator
DROP POLICY IF EXISTS "authenticated_select_chat_library_my_ai_overrides" ON character_studio_v2_my_ai_overrides;
CREATE POLICY "authenticated_select_chat_library_my_ai_overrides"
  ON character_studio_v2_my_ai_overrides FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM character_studio_v2 csv2
      JOIN creators c ON c.id = csv2.creator_id
      WHERE csv2.id = character_studio_v2_my_ai_overrides.character_id
        AND c.is_content_master = true
    )
  );

-- ── 4. customize_ai_overrides ──
-- Existing anon policy: "anon_select_master_customize_ai_overrides" (migration 20260916145542)
-- Condition: override's character belongs to a content-master creator
DROP POLICY IF EXISTS "authenticated_select_chat_library_customize_ai_overrides" ON customize_ai_overrides;
CREATE POLICY "authenticated_select_chat_library_customize_ai_overrides"
  ON customize_ai_overrides FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM character_studio_v2 csv2
      JOIN creators c ON c.id = csv2.creator_id
      WHERE csv2.id = customize_ai_overrides.character_id
        AND c.is_content_master = true
    )
  );
