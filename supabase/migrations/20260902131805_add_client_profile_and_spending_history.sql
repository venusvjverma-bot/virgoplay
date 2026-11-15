/*
# Add client profile columns and spending history table

## Purpose
Extends the clients table with optional profile fields (name, phone, country)
and creates a spending_history table to track credit spending per client.
This supports the Client Dashboard UI.

## Changes to existing tables

### `clients` (modified)
- `full_name` (text, nullable) — optional display name for the client.
- `phone` (text, nullable) — optional phone number.
- `country` (text, nullable) — optional country of residence.

All three are optional (nullable) and default to NULL. No existing data is
affected — the columns are added with ALTER TABLE ADD COLUMN IF NOT EXISTS.

## New Tables

### `client_spending_history`
- `id` (uuid, primary key) — unique row id.
- `client_id` (uuid, not null) — references clients.id, ON DELETE CASCADE.
- `credits` (integer, not null) — number of credits spent (always positive).
- `created_at` (timestamptz, default now()) — when the spending occurred.

## Security — Row Level Security

### `clients` (existing RLS)
The existing anon UPDATE policy already allows updating all columns. No
policy changes needed — the new columns are covered by the existing
`anon_update_clients` policy.

### `client_spending_history` (new)
RLS enabled. Since the client dashboard uses the anon key (no Supabase Auth
session), policies allow anon to:
- SELECT: anon can read spending history for any client (the dashboard
  shows the current client's history).
- INSERT: anon can insert spending records (for future credit system use).

No UPDATE or DELETE policies — spending records are immutable once created.

## Notes
1. Profile fields are all optional — clients can leave them blank.
2. The spending_history table is created now so the dashboard can display
   the section, but no records will exist until the credit system is built.
3. No credits, wallet, or payment logic is added — just the schema.
*/

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS country text;

CREATE TABLE IF NOT EXISTS client_spending_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  credits integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_spending_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_client_spending_history_client_id
  ON client_spending_history(client_id, created_at DESC);

DROP POLICY IF EXISTS "anon_select_spending_history" ON client_spending_history;
CREATE POLICY "anon_select_spending_history" ON client_spending_history FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "anon_insert_spending_history" ON client_spending_history;
CREATE POLICY "anon_insert_spending_history" ON client_spending_history FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
