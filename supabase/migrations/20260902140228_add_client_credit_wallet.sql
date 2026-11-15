/*
# Add credit wallet to client accounts

## Purpose
Adds a credit_balance column to the clients table and enhances the
client_spending_history table to support both credit grants (additions)
and spending (deductions) with a transaction type and description.

## Changes

### clients table
- `credit_balance` (integer, not null, default 0) — the client's current
  credit balance. Directly writable by the anon key for testing purposes.

### client_spending_history table
- `transaction_type` (text, not null, default 'spend') — 'grant' or 'spend'.
- `description` (text, nullable) — human-readable description of the transaction.
- Backfill existing rows (if any) to 'spend' type.

## Security
RLS already enabled on both tables. Existing anon policies allow
SELECT and INSERT. We add UPDATE on clients so the dashboard can
adjust credit_balance for testing. The spending_history table gets
an UPDATE policy as well for completeness.

## Initial free credits
The client-verify edge function will grant 10 free credits when a new
account is first verified. This is sufficient for one free chat/scene.
*/

-- Add credit_balance to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credit_balance integer NOT NULL DEFAULT 0;

-- Enhance client_spending_history
ALTER TABLE client_spending_history
  ADD COLUMN IF NOT EXISTS transaction_type text NOT NULL DEFAULT 'spend',
  ADD COLUMN IF NOT EXISTS description text;

-- Backfill existing rows
UPDATE client_spending_history SET transaction_type = 'spend' WHERE transaction_type IS NULL;

-- Add a check constraint for transaction_type
ALTER TABLE client_spending_history
  DROP CONSTRAINT IF EXISTS chk_transaction_type;
ALTER TABLE client_spending_history
  ADD CONSTRAINT chk_transaction_type CHECK (transaction_type IN ('grant', 'spend'));

-- Allow anon to update clients (for test credit additions)
DROP POLICY IF EXISTS "anon_update_clients" ON clients;
CREATE POLICY "anon_update_clients" ON clients FOR UPDATE
  TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Allow anon to update spending history
DROP POLICY IF EXISTS "anon_update_client_spending_history" ON client_spending_history;
CREATE POLICY "anon_update_client_spending_history" ON client_spending_history FOR UPDATE
  TO anon, authenticated
  USING (true) WITH CHECK (true);
