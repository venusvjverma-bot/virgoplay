/*
# Add like_count to chat_library_listings

## Purpose
Each Public Chat Link (creator_id + role_id) gets its own global like count.
Anyone can like without login via a SECURITY DEFINER RPC that atomically
increments only the matching row. No new tables.

## Changes
1. Add `like_count` column (integer, NOT NULL, default 0) to `chat_library_listings`.
2. Create `increment_like_count(p_creator_id uuid, p_role_id uuid)` — a
   SECURITY DEFINER function that atomically increments `like_count` for the
   exact (creator_id, role_id) row. Returns the new count.
3. Grant EXECUTE on the RPC to `anon` and `authenticated` so anyone can like.

## Security
- The RPC uses SECURITY DEFINER so anon can increment without direct UPDATE
  grants on the table. The function only increments — it cannot set arbitrary
  values or modify other columns.
- Existing RLS policies on `chat_library_listings` are unchanged.
- The new column is readable through the existing public SELECT policy.

## Notes
- Default count is 0 for all existing and new listings.
- No new tables, no new architecture.
- Existing Public Chat Link URLs and Chat Library listing logic are untouched.
*/

ALTER TABLE chat_library_listings
  ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_like_count(p_creator_id uuid, p_role_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count integer;
BEGIN
  UPDATE chat_library_listings
  SET like_count = like_count + 1,
      updated_at = now()
  WHERE creator_id = p_creator_id AND role_id = p_role_id
  RETURNING like_count INTO v_new_count;

  IF v_new_count IS NULL THEN
    -- Row doesn't exist — return 0 rather than creating a phantom listing
    v_new_count := 0;
  END IF;

  RETURN v_new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_like_count(uuid, uuid) TO anon, authenticated;
