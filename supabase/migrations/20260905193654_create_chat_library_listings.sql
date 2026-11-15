/*
# Create chat_library_listings table

## Purpose
A minimal table that records which existing Public Chat Links are listed
in the public Chat Library. A row means "listed"; no row means "not listed".

## New Table: chat_library_listings
- creator_id (uuid, NOT NULL) — FK to creators.id — the creator who owns the chat link
- role_id (uuid, NOT NULL) — FK to character_roles.id — the role the chat link points to
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())
- Primary key: composite (creator_id, role_id) — one listing per creator per role

## Security
- RLS enabled.
- SELECT: public (anon + authenticated) — the Chat Library page must work without login.
- INSERT/UPDATE/DELETE: authenticated only, owner-scoped (creator_id = auth.uid()).

## Notes
- This table does NOT store role images, character names, or any other data already
  available in character_roles / character_studio_v2 / role_image_productions.
  Those are joined at runtime when the Chat Library page renders.
- The existing Public Chat Link flow is completely untouched — the URL is still
  constructed dynamically from role_id + creator_id.
*/

CREATE TABLE IF NOT EXISTS chat_library_listings (
  creator_id uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES character_roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (creator_id, role_id)
);

ALTER TABLE chat_library_listings ENABLE ROW LEVEL SECURITY;

-- Public read: the Chat Library page must work without client login
DROP POLICY IF EXISTS "public_select_chat_library_listings" ON chat_library_listings;
CREATE POLICY "public_select_chat_library_listings"
ON chat_library_listings FOR SELECT
TO anon, authenticated
USING (true);

-- Only the creator who owns the listing can insert it
DROP POLICY IF EXISTS "creator_insert_chat_library_listings" ON chat_library_listings;
CREATE POLICY "creator_insert_chat_library_listings"
ON chat_library_listings FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = creator_id);

-- Only the creator who owns the listing can update it
DROP POLICY IF EXISTS "creator_update_chat_library_listings" ON chat_library_listings;
CREATE POLICY "creator_update_chat_library_listings"
ON chat_library_listings FOR UPDATE
TO authenticated
USING (auth.uid() = creator_id)
WITH CHECK (auth.uid() = creator_id);

-- Only the creator who owns the listing can delete it
DROP POLICY IF EXISTS "creator_delete_chat_library_listings" ON chat_library_listings;
CREATE POLICY "creator_delete_chat_library_listings"
ON chat_library_listings FOR DELETE
TO authenticated
USING (auth.uid() = creator_id);
