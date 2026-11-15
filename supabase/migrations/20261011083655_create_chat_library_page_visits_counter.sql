/*
# Add persistent page-visit counter for the Public Chat Library

1. New Tables
- `chat_library_page_visits`
  - `id` (integer, primary key, fixed to 1 — guarantees exactly one row)
  - `visit_count` (bigint, not null, default 0 — total page visits)
  - `updated_at` (timestamptz, not null, default now() — last increment time)

2. New Functions
- `increment_chat_library_visits()` — SECURITY DEFINER SQL function that atomically
  increments `visit_count` by 1 and returns the new total. The atomic single-statement
  UPDATE makes concurrent page loads safe (no lost increments).

3. Security
- Row Level Security ENABLED on `chat_library_page_visits`.
- SELECT policy allows `anon` and `authenticated` to read the total.
- NO INSERT/UPDATE/DELETE policies: visitors can never write the table directly.
  The only way to increment is through the SECURITY DEFINER function, which is
  granted EXECUTE to `anon` and `authenticated` only.

4. Notes
- The initial row is seeded with `ON CONFLICT DO NOTHING` so the migration is
  repeatable and never resets an existing count.
- This counter tracks Public Chat Library (`/chat-library`) page loads only.
*/

CREATE TABLE IF NOT EXISTS chat_library_page_visits (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  visit_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO chat_library_page_visits (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE chat_library_page_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_chat_library_page_visits" ON chat_library_page_visits;
CREATE POLICY "anon_read_chat_library_page_visits"
ON chat_library_page_visits FOR SELECT
TO anon, authenticated
USING (true);

CREATE OR REPLACE FUNCTION increment_chat_library_visits()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE chat_library_page_visits
  SET visit_count = visit_count + 1,
      updated_at = now()
  WHERE id = 1
  RETURNING visit_count;
$$;

REVOKE ALL ON FUNCTION increment_chat_library_visits() FROM public;
GRANT EXECUTE ON FUNCTION increment_chat_library_visits() TO anon, authenticated;