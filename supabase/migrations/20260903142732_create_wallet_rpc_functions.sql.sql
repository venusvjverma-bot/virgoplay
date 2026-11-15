-- RPC functions for wallet balance management
-- 1. add_test_funds: adds $1.00 to available_balance and records a transaction
-- 2. deduct_wallet_balance: atomically checks and deducts balance, records transaction

CREATE OR REPLACE FUNCTION add_test_funds(p_wallet_id uuid, p_amount numeric)
RETURNS creator_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result creator_wallets;
BEGIN
  UPDATE creator_wallets
  SET available_balance = available_balance + p_amount,
      updated_at = now()
  WHERE id = p_wallet_id
  RETURNING * INTO result;

  INSERT INTO creator_transactions (wallet_id, creator_id, type, description, amount, status)
  SELECT p_wallet_id, creator_id, 'credit', 'Test funds added', p_amount, 'completed'
  FROM creator_wallets WHERE id = p_wallet_id;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION deduct_wallet_balance(
  p_wallet_id uuid,
  p_amount numeric,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance numeric;
  wallet_creator_id uuid;
BEGIN
  SELECT available_balance, creator_id INTO current_balance, wallet_creator_id
  FROM creator_wallets WHERE id = p_wallet_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'new_balance', current_balance);
  END IF;

  UPDATE creator_wallets
  SET available_balance = available_balance - p_amount,
      updated_at = now()
  WHERE id = p_wallet_id;

  INSERT INTO creator_transactions (wallet_id, creator_id, type, description, amount, status)
  VALUES (p_wallet_id, wallet_creator_id, 'debit', p_description, p_amount, 'completed');

  RETURN jsonb_build_object('success', true, 'new_balance', current_balance - p_amount);
END;
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION add_test_funds(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_wallet_balance(uuid, numeric, text) TO authenticated;
