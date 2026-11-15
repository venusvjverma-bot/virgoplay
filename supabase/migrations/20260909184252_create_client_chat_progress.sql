/*
# Create client_chat_progress table

## Purpose
Persists Public Chat scene progress (sceneIndex + sceneReplyCount) per client
so a client resuming a chat on a different browser/device continues from where
they left off. Chat messages are NOT stored here — only the progress position.

## New Tables

### `client_chat_progress`
- `id` (uuid, primary key)
- `client_id` (uuid, not null — references clients.id on delete cascade)
- `role_id` (uuid, not null) — the role being chatted with
- `creator_id` (uuid, not null) — the creator who owns the role
- `scene_index` (integer, not null, default 0) — current scene position
- `scene_reply_count` (integer, not null, default 0) — replies within the current scene
- `updated_at` (timestamptz, not null, default now()) — last progress save time
- Unique constraint on (client_id, role_id, creator_id)

## Indexes
- Index on (client_id, role_id, creator_id) for efficient lookups

## Security — Row Level Security
RLS enabled. The client auth model uses a localStorage client_id (not Supabase
auth.uid()), so policies use TO anon, authenticated with a subquery check
against the clients table to verify the row's client_id belongs to a valid,
active, verified client. This mirrors the pattern used by
client_chat_sessions.

## Notes
1. Only scene progress is stored — never chat messages.
2. One row per (client_id, role_id, creator_id) — upserted on every progress change.
3. Existing localStorage chat history is unchanged; this table supplements it
   for cross-device progress continuity.
*/

CREATE TABLE IF NOT EXISTS client_chat_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role_id uuid NOT NULL,
  creator_id uuid NOT NULL,
  scene_index integer NOT NULL DEFAULT 0,
  scene_reply_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, role_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_client_chat_progress_lookup
  ON client_chat_progress (client_id, role_id, creator_id);

ALTER TABLE client_chat_progress ENABLE ROW LEVEL SECURITY;

-- Clients can read their own chat progress
DROP POLICY IF EXISTS "select_own_chat_progress" ON client_chat_progress;
CREATE POLICY "select_own_chat_progress"
  ON client_chat_progress FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_chat_progress.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  );

-- Clients can insert their own chat progress
DROP POLICY IF EXISTS "insert_own_chat_progress" ON client_chat_progress;
CREATE POLICY "insert_own_chat_progress"
  ON client_chat_progress FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_chat_progress.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  );

-- Clients can update their own chat progress
DROP POLICY IF EXISTS "update_own_chat_progress" ON client_chat_progress;
CREATE POLICY "update_own_chat_progress"
  ON client_chat_progress FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_chat_progress.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_chat_progress.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  );

-- Clients can delete their own chat progress
DROP POLICY IF EXISTS "delete_own_chat_progress" ON client_chat_progress;
CREATE POLICY "delete_own_chat_progress"
  ON client_chat_progress FOR DELETE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_chat_progress.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  );
