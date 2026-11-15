/*
# Client media unlock records

Tracks which media assets a client has permanently unlocked.
Once a record exists for (client_id, media_url), reopening that media
is free — no duplicate charges.

## Table: client_media_unlocks
  - client_id  uuid (FK to clients)
  - media_url  text (the scene image or video URL)
  - media_type text ('image' | 'video')
  - creator_id uuid (FK to auth.users — the creator who earned from this unlock)
  - credits_spent integer
  - unlocked_at timestamptz

  Unique constraint on (client_id, media_url) prevents duplicate unlocks.
*/

CREATE TABLE IF NOT EXISTS client_media_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  creator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  credits_spent integer NOT NULL DEFAULT 0,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, media_url)
);

ALTER TABLE client_media_unlocks ENABLE ROW LEVEL SECURITY;

-- Clients can read their own unlock records
DROP POLICY IF EXISTS "select_own_unlocks" ON client_media_unlocks;
CREATE POLICY "select_own_unlocks" ON client_media_unlocks FOR SELECT
  TO authenticated USING (auth.uid()::text = client_id::text);

-- Service role (edge functions) bypasses RLS, so no insert/update policies needed
-- for the server-side RPC. But we allow clients to read via anon key too.
DROP POLICY IF EXISTS "select_own_unlocks_anon" ON client_media_unlocks;
CREATE POLICY "select_own_unlocks_anon" ON client_media_unlocks FOR SELECT
  TO anon USING (true);

CREATE INDEX IF NOT EXISTS idx_client_media_unlocks_client ON client_media_unlocks(client_id);
CREATE INDEX IF NOT EXISTS idx_client_media_unlocks_media ON client_media_unlocks(client_id, media_url);
