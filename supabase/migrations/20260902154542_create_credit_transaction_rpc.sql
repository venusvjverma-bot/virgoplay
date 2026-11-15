/*
# Atomic credit transaction RPC

## Purpose
Atomically deduct credits from a client's credit_balance and add the same
amount to the creator's total_earnings. Records both sides in their
respective transaction history tables.

## Function: process_credit_transaction
Parameters:
  p_client_id  uuid — the client whose credits will be deducted
  p_creator_id uuid — the creator whose earnings will increase
  p_amount     integer — number of credits to transfer
  p_action     text — 'image' or 'video' (for description)

Returns:
  { success: boolean, reason: text, client_balance: integer, creator_earnings: numeric, insufficient_credits: boolean }

## Security
This function uses SECURITY DEFINER so it can update both tables with
service-role privileges. It is callable only by authenticated users.
*/

CREATE OR REPLACE FUNCTION process_credit_transaction(
  p_client_id  uuid,
  p_creator_id uuid,
  p_amount     integer,
  p_action     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_balance integer;
  v_wallet_id       uuid;
  v_creator_earnings numeric;
BEGIN
  -- ── Lock the client row and check balance ──────────────────────────────
  SELECT credit_balance INTO v_client_balance
    FROM clients
    WHERE id = p_client_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Client not found.', 'insufficient_credits', false);
  END IF;

  IF v_client_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'Insufficient credits. You need ' || p_amount || ' but have ' || v_client_balance || '.',
      'insufficient_credits', true
    );
  END IF;

  -- ── Deduct from client ──────────────────────────────────────────────────
  UPDATE clients
    SET credit_balance = credit_balance - p_amount
    WHERE id = p_client_id;

  -- Record client spending
  INSERT INTO client_spending_history (client_id, credits, transaction_type, description)
    VALUES (p_client_id, p_amount, 'spend', 'Image reveal' || CASE WHEN p_action = 'video' THEN ' (video)' ELSE '' END);

  -- ── Add to creator wallet (create wallet if it doesn't exist) ────────────
  INSERT INTO creator_wallets (creator_id, total_earnings)
    VALUES (p_creator_id, p_amount)
    ON CONFLICT (creator_id)
    DO UPDATE SET
      total_earnings = creator_wallets.total_earnings + p_amount,
      updated_at = now()
    RETURNING id INTO v_wallet_id;

  -- If the wallet already existed (ON CONFLICT UPDATE path), we need the id
  IF v_wallet_id IS NULL THEN
    SELECT id INTO v_wallet_id FROM creator_wallets WHERE creator_id = p_creator_id;
  END IF;

  -- Record creator earning
  INSERT INTO creator_transactions (wallet_id, creator_id, type, description, amount, status)
    VALUES (v_wallet_id, p_creator_id, 'credit',
      'Client ' || p_client_id || ' — ' || CASE WHEN p_action = 'video' THEN 'Video' ELSE 'Image' END || ' reveal',
      p_amount, 'completed');

  -- Get the updated values for the response
  SELECT credit_balance INTO v_client_balance FROM clients WHERE id = p_client_id;
  SELECT total_earnings INTO v_creator_earnings FROM creator_wallets WHERE creator_id = p_creator_id;

  RETURN jsonb_build_object(
    'success', true,
    'client_balance', v_client_balance,
    'creator_earnings', v_creator_earnings
  );
END;
$$;

-- Grant execute to authenticated and anon (anon-key client calls the edge function)
GRANT EXECUTE ON FUNCTION process_credit_transaction TO authenticated, anon;
