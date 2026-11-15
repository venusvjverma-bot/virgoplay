/*
# Fix: digest() not found in SECURITY DEFINER functions

## Problem
The `pgcrypto` extension is installed in the `extensions` schema, not `public`.
The session-token functions (`create_client_session`, `verify_client_session`)
set `search_path = public` and call `digest()` unqualified, so PostgreSQL
cannot find the function — `create_client_session` fails with:
  ERROR: function digest(text, unknown) does not exist

This breaks all client login flows because both `client-verify` and
`client-google-auth` call `create_client_session` after successful
authentication.

## Fix
Replace all unqualified `digest()` calls with `extensions.digest()` in:
- `create_client_session`
- `verify_client_session`

No changes to logic, parameters, grants, or security model.
*/

CREATE OR REPLACE FUNCTION verify_client_session(
  p_client_id uuid,
  p_session_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  IF p_session_token IS NULL OR p_client_id IS NULL THEN
    RETURN false;
  END IF;

  v_hash := encode(extensions.digest(p_session_token, 'sha256'), 'hex');

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

CREATE OR REPLACE FUNCTION create_client_session(
  p_client_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO client_sessions (client_id, token_hash)
  VALUES (p_client_id, v_hash);

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION create_client_session(uuid) TO anon, authenticated;

-- Also update verify_session_for_client to include extensions in search_path
CREATE OR REPLACE FUNCTION verify_session_for_client(
  p_client_id uuid,
  p_session_token text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN verify_client_session(p_client_id, p_session_token);
END;
$$;

GRANT EXECUTE ON FUNCTION verify_session_for_client(uuid, text) TO anon, authenticated;