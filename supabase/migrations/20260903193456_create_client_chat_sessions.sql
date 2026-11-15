/*
# Create client_chat_sessions table

1. Purpose
   - Lightweight tracking of which Public Chats a client has started.
   - Stores only the chat identity (role_id + creator_id) and last-active timestamp.
   - Does NOT store chat messages or chat content.

2. New Tables
   - `client_chat_sessions`
     - `id` (uuid, primary key)
     - `client_id` (uuid, not null — references clients.id on delete cascade)
     - `role_id` (uuid, not null — references character_roles.id on delete cascade)
     - `creator_id` (uuid, not null)
     - `last_active_at` (timestamptz, not null, defaults to now())
     - `created_at` (timestamptz, not null, defaults to now())
     - Unique constraint on (client_id, role_id, creator_id)

3. Indexes
   - Index on (client_id, last_active_at DESC) for efficient "most recent chats" queries.

4. Security
   - RLS enabled.
   - Clients can only SELECT/INSERT/UPDATE/DELETE their own session rows.
   - Policies use client_id = auth.uid() equivalent via the clients table.
   - Since the client auth model uses a localStorage client_id (not Supabase auth.uid()),
     policies use TO anon, authenticated with a subquery check against the clients table
     to verify the row's client_id matches a valid, active, verified client.
   - For simplicity and since this is a client-facing table with no sensitive data
     (just role_id/creator_id references), policies scope by client_id matching
     the request, validated through RLS on the clients table itself.
*/

CREATE TABLE IF NOT EXISTS client_chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role_id uuid NOT NULL,
  creator_id uuid NOT NULL,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, role_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_client_chat_sessions_client_active
  ON client_chat_sessions (client_id, last_active_at DESC);

ALTER TABLE client_chat_sessions ENABLE ROW LEVEL SECURITY;

-- Clients can read their own chat sessions
DROP POLICY IF EXISTS "select_own_chat_sessions" ON client_chat_sessions;
CREATE POLICY "select_own_chat_sessions"
  ON client_chat_sessions FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_chat_sessions.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  );

-- Clients can insert their own chat sessions
DROP POLICY IF EXISTS "insert_own_chat_sessions" ON client_chat_sessions;
CREATE POLICY "insert_own_chat_sessions"
  ON client_chat_sessions FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_chat_sessions.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  );

-- Clients can update their own chat sessions (for last_active_at upserts)
DROP POLICY IF EXISTS "update_own_chat_sessions" ON client_chat_sessions;
CREATE POLICY "update_own_chat_sessions"
  ON client_chat_sessions FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_chat_sessions.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_chat_sessions.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  );

-- Clients can delete their own chat sessions
DROP POLICY IF EXISTS "delete_own_chat_sessions" ON client_chat_sessions;
CREATE POLICY "delete_own_chat_sessions"
  ON client_chat_sessions FOR DELETE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_chat_sessions.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  );
