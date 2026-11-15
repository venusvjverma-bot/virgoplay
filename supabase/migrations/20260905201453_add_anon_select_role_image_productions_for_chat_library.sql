/*
# Fix: Allow logged-out visitors to see role images for Chat Library listings

## Problem
The /chat-library page queries role_image_productions to display the role
thumbnail. When logged in as the creator, the existing authenticated SELECT
policy (auth.uid() = creator_id) returns the row. When logged out (anon role),
there is no SELECT policy on role_image_productions, so zero rows are returned
and the thumbnail is missing.

## Fix
Add a single anon SELECT policy on role_image_productions that only exposes
rows whose role_id appears in chat_library_listings — i.e. only roles that a
creator has explicitly listed in the public Chat Library.

## Column access restriction
Revoke the blanket column-level SELECT grants that anon inherited from the
table-level grants, then re-grant SELECT on only role_id and role_image_url.
This ensures anon can only read those two columns, not creator_id, file paths,
asset IDs, generation IDs, or timestamps.

## Security
- The new policy is scoped: anon can ONLY read rows where the role is listed
  in chat_library_listings.
- Column-level privileges restrict anon to role_id + role_image_url only.
- No changes to any existing authenticated policies.
- No changes to chat_library_listings logic.
- No changes to Public Chat Link behavior.
*/

-- 1. Add anon SELECT policy scoped to Chat Library listings
DROP POLICY IF EXISTS "anon_select_role_images_for_chat_library" ON role_image_productions;
CREATE POLICY "anon_select_role_images_for_chat_library"
ON role_image_productions FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM chat_library_listings cll
    WHERE cll.role_id = role_image_productions.role_id
  )
);

-- 2. Restrict anon column access to only role_id and role_image_url
--    First revoke all column-level SELECT grants for anon, then re-grant
--    only the two columns the Chat Library page needs.
REVOKE SELECT ON role_image_productions FROM anon;
GRANT SELECT (role_id, role_image_url) ON role_image_productions TO anon;
