/*
# Create client_chat_messages table (cross-device text chat history)

## 1. Purpose

The Public Test Chat currently stores conversation text only in each device's
localStorage, so a VirgoPlay Client who signs in on a different device starts
with an empty transcript. This migration adds a dedicated table that stores
each client's full saved text conversation so it can be restored on any device
after signing in with the same Client Account.

## 2. New Tables

- `client_chat_messages`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `client_id` (uuid, NOT NULL, references public.clients(id) ON DELETE CASCADE) — the Client Account that owns this conversation
  - `role_id` (uuid, NOT NULL) — the roleplay role the conversation belongs to
  - `creator_id` (uuid, NOT NULL) — the creator who published the roleplay
  - `messages` (jsonb, NOT NULL, default '[]') — the full ordered text message history, preserving each message's role, content, and rendering metadata (scene descriptions, scene-transition invitations)
  - `chat_ended` (boolean, NOT NULL, default false) — whether the roleplay reached its ending
  - `updated_at` (timestamp with time zone, NOT NULL, default now()) — refreshed every time the conversation is saved
  - Unique constraint `client_chat_messages_client_role_creator_key` on (client_id, role_id, creator_id) so each Client Account has exactly one saved text history per role and creator. Upserts use this key, so duplicate conversations cannot be created.

## 3. Security

- Row Level Security is ENABLED on `client_chat_messages`.
- Four separate policies (SELECT, INSERT, UPDATE, DELETE), TO anon + authenticated (the app's client authentication is account-based, not Supabase-auth-based), each restricted to rows whose `client_id` belongs to a Client Account that is both email-verified and active. This mirrors the existing client-identity architecture used by `client_chat_sessions` and `client_chat_progress` — no overly permissive "true" policies.

## 4. Notes

- No image or video data is stored here; only text messages and their rendering metadata.
- No changes to existing tables, media unlock records, or credit transactions.
*/

CREATE TABLE IF NOT EXISTS public.client_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  role_id uuid NOT NULL,
  creator_id uuid NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  chat_ended boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_chat_messages_client_role_creator_key UNIQUE (client_id, role_id, creator_id)
);

ALTER TABLE public.client_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_chat_messages" ON public.client_chat_messages;
CREATE POLICY "select_own_chat_messages" ON public.client_chat_messages
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_chat_messages.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS "insert_own_chat_messages" ON public.client_chat_messages;
CREATE POLICY "insert_own_chat_messages" ON public.client_chat_messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_chat_messages.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS "update_own_chat_messages" ON public.client_chat_messages;
CREATE POLICY "update_own_chat_messages" ON public.client_chat_messages
  FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_chat_messages.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_chat_messages.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS "delete_own_chat_messages" ON public.client_chat_messages;
CREATE POLICY "delete_own_chat_messages" ON public.client_chat_messages
  FOR DELETE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_chat_messages.client_id
        AND c.email_verified = true
        AND c.is_active = true
    )
  );
