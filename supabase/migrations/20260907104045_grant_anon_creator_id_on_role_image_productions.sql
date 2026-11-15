/*
# Grant anon read access to creator_id on role_image_productions

## Purpose
The Chat Library page (/chat-library) loads a role thumbnail for each listing
by querying role_image_productions. When two different creators share the same
role_id (inherited/shared roles), the page needs creator_id to distinguish
which creator's image to use. The existing anon column grant only covers
role_id and role_image_url, so the page cannot build a composite key.

## Changes
- Re-grant SELECT on (creator_id, role_id, role_image_url) to anon.
  This adds creator_id to the existing anon column privilege set.
  The existing RLS policy "anon_select_role_images_for_chat_library" already
  restricts which rows anon can see (only rows whose role_id appears in
  chat_library_listings), so no policy change is needed — only the column
  grant is widened by one column.

## Security
- RLS still applies: anon can only read rows whose role_id is listed in
  chat_library_listings (existing policy unchanged).
- anon can now read creator_id, role_id, and role_image_url — the minimum
  columns needed to map each listing's image by creator+role.
- No other columns (file paths, asset IDs, generation IDs, timestamps) are
  exposed to anon.
- No changes to authenticated policies.
*/

REVOKE SELECT ON role_image_productions FROM anon;
GRANT SELECT (creator_id, role_id, role_image_url) ON role_image_productions TO anon;
