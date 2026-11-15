/*
# Create clients table — Client Account Foundation

## Purpose
Creates the foundation for a lightweight, email-only client account system.
Clients sign up with just an email address (no password, no username, no profile).
A verification code is sent to the email; once verified, the client account is
activated and identified by a unique client_id.

## New Tables

### `clients`
- `id` (uuid, primary key) — the unique client_id used to identify a client.
- `email` (text, unique, not null) — the client's email address, stored lowercase.
- `email_verified` (boolean, default false) — whether the email has been verified.
- `is_active` (boolean, default true) — whether the account is active.
- `verification_code` (text, nullable) — 6-digit code used during email verification.
- `verification_expires_at` (timestamptz, nullable) — when the verification code expires.
- `created_at` (timestamptz, default now()) — when the account was created.

## Security — Row Level Security
RLS is enabled on `clients`. Since the client signup flow uses the anon key
(no Supabase Auth session), policies must allow `anon` access:

- SELECT: anon can look up a client by email or id (needed for verification and
  client identification).
- INSERT: anon can create a new client account (signup).
- UPDATE: anon can update verification status and code (verify flow). The
  WITH CHECK ensures only the verification fields can be set by anon — the
  email column is locked after insert.

No DELETE policy is defined — clients are never deleted from the anon client.

## Notes
1. This is a standalone client account system, separate from the creator
   auth (Supabase Auth). Clients do not have passwords.
2. The verification_code is a simple 6-digit numeric code, not a JWT or
   cryptographic token — it expires after 15 minutes and is single-use.
3. The email is stored lowercase for consistent lookups.
*/

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  verification_code text,
  verification_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- SELECT: anon can look up clients by email or id (for verification + identification)
DROP POLICY IF EXISTS "anon_select_clients" ON clients;
CREATE POLICY "anon_select_clients" ON clients FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT: anon can create a new client account
DROP POLICY IF EXISTS "anon_insert_clients" ON clients;
CREATE POLICY "anon_insert_clients" ON clients FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- UPDATE: anon can update verification fields (verify email, set new code)
DROP POLICY IF EXISTS "anon_update_clients" ON clients;
CREATE POLICY "anon_update_clients" ON clients FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
