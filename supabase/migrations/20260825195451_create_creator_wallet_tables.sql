/*
# Create wallet and transaction tables for creators

1. New Tables
- `creator_wallets`: one wallet per creator, tracks available balance and total earnings.
  - `id` (uuid PK)
  - `creator_id` (uuid, FK to auth.users, unique)
  - `available_balance` (numeric, default 0)
  - `total_earnings` (numeric, default 0)
  - `created_at`, `updated_at` (timestamps)
- `creator_transactions`: transaction history per wallet.
  - `id` (uuid PK)
  - `wallet_id` (uuid, FK to creator_wallets)
  - `creator_id` (uuid, FK to auth.users — for direct RLS scoping)
  - `type` (text: 'credit' | 'debit')
  - `description` (text)
  - `amount` (numeric)
  - `status` (text: 'pending' | 'completed' | 'failed')
  - `created_at` (timestamp)

2. Security
- RLS enabled on both tables.
- Owner-scoped CRUD: each authenticated creator can only access their own wallet/transactions.
- `creator_id` defaults to `auth.uid()` so inserts work without client passing it.
*/

CREATE TABLE IF NOT EXISTS creator_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  available_balance numeric(12,2) NOT NULL DEFAULT 0,
  total_earnings numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id)
);

ALTER TABLE creator_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_wallet" ON creator_wallets;
CREATE POLICY "select_own_wallet" ON creator_wallets FOR SELECT
  TO authenticated USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "insert_own_wallet" ON creator_wallets;
CREATE POLICY "insert_own_wallet" ON creator_wallets FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "update_own_wallet" ON creator_wallets;
CREATE POLICY "update_own_wallet" ON creator_wallets FOR UPDATE
  TO authenticated USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "delete_own_wallet" ON creator_wallets;
CREATE POLICY "delete_own_wallet" ON creator_wallets FOR DELETE
  TO authenticated USING (auth.uid() = creator_id);

CREATE TABLE IF NOT EXISTS creator_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES creator_wallets(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'credit',
  description text NOT NULL DEFAULT '',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE creator_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_transactions" ON creator_transactions;
CREATE POLICY "select_own_transactions" ON creator_transactions FOR SELECT
  TO authenticated USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "insert_own_transactions" ON creator_transactions;
CREATE POLICY "insert_own_transactions" ON creator_transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "update_own_transactions" ON creator_transactions;
CREATE POLICY "update_own_transactions" ON creator_transactions FOR UPDATE
  TO authenticated USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "delete_own_transactions" ON creator_transactions;
CREATE POLICY "delete_own_transactions" ON creator_transactions FOR DELETE
  TO authenticated USING (auth.uid() = creator_id);

CREATE INDEX IF NOT EXISTS idx_creator_transactions_wallet_id ON creator_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_creator_transactions_creator_id ON creator_transactions(creator_id);
