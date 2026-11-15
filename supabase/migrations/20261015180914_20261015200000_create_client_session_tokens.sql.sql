/*
# Client Session Token Infrastructure

## Purpose
Creates a server-issued session token mechanism for Client accounts.
Clients currently authenticate via email-code or Google login, receiving only
a client_id UUID stored in localStorage. This UUID is passed as a free parameter
to all mutating RPCs with no server-side proof of identity — anyone who knows
the UUID can impersonate the client.

This migration introduces:
1. A `client_sessions` table storing hashed session tokens.
2. A `create_client_session()` function that generates a token, stores its
   SHA-256 hash, and returns the raw token (only time it's visible).
3. A `verify_client_session()` helper that checks a token against the stored
   hash, verifying ownership, expiry, and revocation status.
4. A `revoke_client_sessions()` helper that revokes all active sessions for
   a given client (used on deactivation).

## New Tables

### `client_sessions`
- `id` (uuid, primary key) — unique row id.
- `client_id` (uuid, not null, FK to clients.id ON DELETE CASCADE) — the client this session belongs to.
- `token_hash` (text, not null) — SHA-256 hash of the raw session token. Raw tokens are never stored.
- `created_at` (timestamptz, default now()) — when the session was created.
- `expires_at` (timestamptz, not null, default now() + 30 days) — when the token expires.
- `revoked_at` (timestamptz, nullable) — null = active, non-null = revoked.

## Security
- RLS enabled on `client_sessions`. No policies for anon or authenticated —
  all access is through SECURITY DEFINER functions that run as the table owner.
- All table-level grants revoked from anon and authenticated.
- `verify_client_session` has NO EXECUTE grant — it is called only internally
  by other SECURITY DEFINER functions.
- `create_client_session` is granted to anon and authenticated so edge functions
  can call it with the service role.
- `revoke_client_sessions` has no EXECUTE grant — called only internally by
  `self_deactivate_client`.

## Important Notes
1. Raw tokens are NEVER stored in the database — only their SHA-256 hashes.
2. Tokens expire after 30 days. Expired tokens fail verification.
3. Revoked tokens (revoked_at non-null) fail verification immediately.
4. A client can have multiple active sessions (e.g., signed in on two devices).
5. The `pgcrypto` extension is required for `digest()` — it is enabled by default
   on Supabase, but we ensure it here.
*/

-- Ensure pgcrypto is available for digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS client_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at timestamptz
);

ALTER TABLE client_sessions ENABLE ROW LEVEL SECURITY;

-- No policies — all access via SECURITY DEFINER functions
REVOKE ALL ON client_sessions FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_client_sessions_token_hash
  ON client_sessions(token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_client_sessions_client
  ON client_sessions(client_id);

-- ── verify_client_session: internal helper, no EXECUTE grant ──────────────
CREATE OR REPLACE FUNCTION verify_client_session(
  p_client_id uuid,
  p_session_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
BEGIN
  IF p_session_token IS NULL OR p_client_id IS NULL THEN
    RETURN false;
  END IF;

  v_hash := encode(digest(p_session_token, 'sha256'), 'hex');

  RETURN EXISTS(
    SELECT 1 FROM client_sessions
    WHERE client_id = p_client_id
      AND token_hash = v_hash
      AND revoked_at IS NULL
      AND expires_at > now()
  );
END;
$$;
-- No GRANT EXECUTE — internal only

-- ── create_client_session: returns raw token, stores hash ──────────────────
CREATE OR REPLACE FUNCTION create_client_session(
  p_client_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_hash text;
BEGIN
  IF p_client_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Generate a random token: two UUIDs concatenated
  v_token := gen_random_uuid()::text || '-' || gen_random_uuid()::text;
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO client_sessions (client_id, token_hash)
  VALUES (p_client_id, v_hash);

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION create_client_session(uuid) TO anon, authenticated;

-- ── revoke_client_sessions: internal helper for deactivation ──────────────
CREATE OR REPLACE FUNCTION revoke_client_sessions(
  p_client_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_client_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE client_sessions
  SET revoked_at = now()
  WHERE client_id = p_client_id
    AND revoked_at IS NULL;
END;
$$;
-- No GRANT EXECUTE — internal only