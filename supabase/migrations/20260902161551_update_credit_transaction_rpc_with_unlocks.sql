-- Drop the old function signature (4 params) before recreating with 5 params
DROP FUNCTION IF EXISTS process_credit_transaction(uuid, uuid, integer, text);

CREATE OR REPLACE FUNCTION process_credit_transaction(
  p_client_id  uuid,
  p_creator_id uuid,
  p_amount     integer,
  p_action     text,
  p_media_url  text DEFAULT NULL
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
  v_already_unlocked boolean;
BEGIN
  -- ── Check if media is already unlocked ──────────────────────────────────
  IF p_media_url IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM client_media_unlocks
      WHERE client_id = p_client_id AND media_url = p_media_url
    ) INTO v_already_unlocked;

    IF v_already_unlocked THEN
      SELECT credit_balance INTO v_client_balance FROM clients WHERE id = p_client_id;
      SELECT total_earnings INTO v_creator_earnings FROM creator_wallets WHERE creator_id = p_creator_id;
      RETURN jsonb_build_object(
        'success', true,
        'already_unlocked', true,
        'client_balance', v_client_balance,
        'creator_earnings', v_creator_earnings,
        'cost', 0
      );
    END IF;
  END IF;

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

  INSERT INTO client_spending_history (client_id, credits, transaction_type, description)
    VALUES (p_client_id, p_amount, 'spend', 'Image reveal' || CASE WHEN p_action = 'video' THEN ' (video)' ELSE '' END);

  -- ── Add to creator wallet ────────────────────────────────────────────────
  INSERT INTO creator_wallets (creator_id, total_earnings)
    VALUES (p_creator_id, p_amount)
    ON CONFLICT (creator_id)
    DO UPDATE SET
      total_earnings = creator_wallets.total_earnings + p_amount,
      updated_at = now()
    RETURNING id INTO v_wallet_id;

  IF v_wallet_id IS NULL THEN
    SELECT id INTO v_wallet_id FROM creator_wallets WHERE creator_id = p_creator_id;
  END IF;

  INSERT INTO creator_transactions (wallet_id, creator_id, type, description, amount, status)
    VALUES (v_wallet_id, p_creator_id, 'credit',
      'Client ' || p_client_id || ' — ' || CASE WHEN p_action = 'video' THEN 'Video' ELSE 'Image' END || ' reveal',
      p_amount, 'completed');

  -- ── Create permanent unlock record ─────────────────────────────────────
  IF p_media_url IS NOT NULL THEN
    INSERT INTO client_media_unlocks (client_id, media_url, media_type, creator_id, credits_spent)
      VALUES (p_client_id, p_media_url, p_action, p_creator_id, p_amount)
      ON CONFLICT (client_id, media_url) DO NOTHING;
  END IF;

  SELECT credit_balance INTO v_client_balance FROM clients WHERE id = p_client_id;
  SELECT total_earnings INTO v_creator_earnings FROM creator_wallets WHERE creator_id = p_creator_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_unlocked', false,
    'client_balance', v_client_balance,
    'creator_earnings', v_creator_earnings,
    'cost', p_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_credit_transaction(uuid, uuid, integer, text, text) TO authenticated, anon;
