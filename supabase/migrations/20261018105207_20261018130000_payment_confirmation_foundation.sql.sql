/*
# Payment Confirmation Foundation (Provider-Independent)

1. Purpose
   Prepares the existing `client_credit_orders` foundation for a FUTURE,
   approved payment provider. NO payment provider is currently configured
   (no payment provider keys exist in the project's deployed secrets), so
   this migration adds only provider-independent, server-side preparation.
   No HTTP endpoint is created. No credits can be granted by any browser
   role — the fulfillment function below has NO public EXECUTE grant and
   can only be invoked by trusted server-side code (service role) AFTER
   that code has verified a genuine provider payment notification using
   the provider's documented signature-verification mechanism.

2. Modified Table: `client_credit_orders` (new columns only)
   - `paid_at` (timestamptz, nullable) — when the order was confirmed paid
     by verified provider evidence.
   - `credits_granted` (boolean, not null, default false) — idempotency
     guard: true once the purchased credits have been added to the client
     balance for this order. Never set for failed/cancelled/refunded orders.
   - `failure_reason` (text, nullable) — last processing failure, for
     troubleshooting.
   No existing columns are changed or removed. No existing rows are modified.

3. New Table: `client_credit_order_events`
   Audit/troubleshooting trail of payment-processing attempts per order.
   - `id` (uuid, primary key)
   - `order_id` (text, not null) — references client_credit_orders(order_id)
     ON DELETE CASCADE.
   - `event_type` (text, not null) — one of: received, verified, rejected,
     fulfilled, failed (CHECK constraint).
   - `detail` (jsonb, nullable) — structured context (e.g. why a payment
     was rejected: amount mismatch, duplicate reference, bad status).
   - `created_at` (timestamptz, not null, default now()).
   Security: RLS enabled, NO policies, ALL grants revoked from anon and
   authenticated — deny-by-default, same as `client_sessions` and
   `client_credit_orders`. Only trusted server-side code (service role)
   can read/write it.

4. New Function: `client_fulfill_paid_order(...)` — INTERNAL ONLY
   The single fulfillment primitive for the future payment webhook:
   `client_fulfill_paid_order(p_order_id text, p_provider text,
    p_provider_txn_ref text, p_amount numeric, p_currency text)`
   SECURITY DEFINER. EXECUTE is explicitly REVOKED from PUBLIC, anon, and
   authenticated — callable ONLY by the table owner / service role.

   Safety rules enforced inside the function:
   - The caller must supply the provider transaction reference, amount,
     and currency from a VERIFIED provider notification. The function
     itself never trusts browser input (no browser role can call it).
   - Amount must exactly match the order's stored `price_amount` and the
     currency must exactly match the stored `currency`. If the order has
     no finalised price/currency (NULL), fulfillment is REJECTED — an
     order cannot be paid for an unverified amount.
   - Only orders in `pending` status can be fulfilled. paid, failed,
     cancelled, and refunded orders are rejected.
   - Idempotency: the order row is locked (FOR UPDATE); the unique
     (payment_provider, provider_transaction_ref) index prevents the same
     provider reference being recorded for two orders; a duplicate
     notification for an already-fulfilled order returns
     `already_fulfilled: true` WITHOUT granting credits again.
   - Credits are granted only after all checks pass: the client's
     `credit_balance` is increased by the order's `credit_amount` and a
     'grant' row is written to `client_spending_history` referencing the
     order id. Client credits remain fully separate from creator wallets
     and earnings — creator tables are not touched.
   - Every rejection and fulfillment is recorded in
     `client_credit_order_events` for troubleshooting.

5. Preserved functionality
   - `admin_update_client` (super-admin credit granting) is NOT modified.
   - All existing RLS policies and grants are unchanged.
   - Client session tokens, balances, spending history, media unlocks,
     creator wallets, and login flows are untouched.

6. Important Notes
   1. No payment gateway is connected and no live credentials are added.
   2. No orders are created and no credits are granted by this migration.
   3. The signature-verification step itself is provider-specific and
      remains future work: the chosen provider's webhook edge function
      must verify the notification signature FIRST, then call this
      function with the verified details.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. New columns on client_credit_orders
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE client_credit_orders
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS credits_granted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS failure_reason text;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Payment-processing event log
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_credit_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES client_credit_orders(order_id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('received', 'verified', 'rejected', 'fulfilled', 'failed')),
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_credit_order_events ENABLE ROW LEVEL SECURITY;

-- Deny-by-default: no policies, no grants for browser roles
REVOKE ALL ON client_credit_order_events FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_client_credit_order_events_order
  ON client_credit_order_events(order_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Internal fulfillment primitive (service role only)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION client_fulfill_paid_order(
  p_order_id          text,
  p_provider          text,
  p_provider_txn_ref  text,
  p_amount            numeric,
  p_currency          text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order        client_credit_orders%ROWTYPE;
  v_new_balance  integer;
  v_ref_taken    boolean;
BEGIN
  IF p_order_id IS NULL OR p_provider IS NULL OR p_provider_txn_ref IS NULL
     OR p_amount IS NULL OR p_currency IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing payment evidence');
  END IF;

  -- Provider reference must not already belong to another order
  SELECT EXISTS(
    SELECT 1 FROM client_credit_orders
    WHERE payment_provider = p_provider
      AND provider_transaction_ref = p_provider_txn_ref
      AND order_id <> p_order_id
  ) INTO v_ref_taken;
  IF v_ref_taken THEN
    RETURN jsonb_build_object('success', false, 'error', 'Provider transaction reference already used');
  END IF;

  -- Lock the order row
  SELECT * INTO v_order FROM client_credit_orders
    WHERE order_id = p_order_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Idempotency: already fulfilled with the same provider reference
  IF v_order.credits_granted THEN
    IF v_order.payment_provider = p_provider
       AND v_order.provider_transaction_ref = p_provider_txn_ref THEN
      INSERT INTO client_credit_order_events (order_id, event_type, detail)
      VALUES (p_order_id, 'fulfilled',
        jsonb_build_object('duplicate_notification', true, 'provider', p_provider));
      RETURN jsonb_build_object(
        'success', true,
        'already_fulfilled', true,
        'order_id', v_order.order_id,
        'credit_balance', (SELECT credit_balance FROM clients WHERE id = v_order.client_id)
      );
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Order already fulfilled with a different payment');
  END IF;

  -- Only pending orders can be fulfilled
  IF v_order.status <> 'pending' THEN
    UPDATE client_credit_orders SET failure_reason = 'Rejected: order status is ' || v_order.status
      WHERE order_id = p_order_id;
    INSERT INTO client_credit_order_events (order_id, event_type, detail)
    VALUES (p_order_id, 'rejected',
      jsonb_build_object('reason', 'order status is ' || v_order.status, 'provider', p_provider));
    RETURN jsonb_build_object('success', false, 'error', 'Order is not pending (status: ' || v_order.status || ')');
  END IF;

  -- Amount and currency must exactly match the order (NULL = not finalised = reject)
  IF v_order.price_amount IS NULL OR v_order.currency IS NULL THEN
    UPDATE client_credit_orders SET failure_reason = 'Rejected: order price/currency not finalised'
      WHERE order_id = p_order_id;
    INSERT INTO client_credit_order_events (order_id, event_type, detail)
    VALUES (p_order_id, 'rejected',
      jsonb_build_object('reason', 'order price/currency not finalised', 'provider', p_provider));
    RETURN jsonb_build_object('success', false, 'error', 'Order price or currency not finalised');
  END IF;

  IF v_order.price_amount <> p_amount OR upper(v_order.currency) <> upper(p_currency) THEN
    UPDATE client_credit_orders SET failure_reason = 'Rejected: payment amount/currency mismatch'
      WHERE order_id = p_order_id;
    INSERT INTO client_credit_order_events (order_id, event_type, detail)
    VALUES (p_order_id, 'rejected',
      jsonb_build_object(
        'reason', 'amount/currency mismatch',
        'expected_amount', v_order.price_amount,
        'expected_currency', v_order.currency,
        'received_amount', p_amount,
        'received_currency', p_currency,
        'provider', p_provider
      ));
    RETURN jsonb_build_object('success', false, 'error', 'Payment amount or currency does not match the order');
  END IF;

  -- All checks passed: mark paid and grant credits atomically
  UPDATE client_credit_orders
    SET status = 'paid',
        paid_at = now(),
        credits_granted = true,
        payment_provider = p_provider,
        provider_transaction_ref = p_provider_txn_ref,
        failure_reason = NULL
    WHERE order_id = p_order_id;

  UPDATE clients
    SET credit_balance = credit_balance + v_order.credit_amount
    WHERE id = v_order.client_id
    RETURNING credit_balance INTO v_new_balance;

  INSERT INTO client_spending_history (client_id, credits, transaction_type, description)
    VALUES (v_order.client_id, v_order.credit_amount, 'grant',
      'Credits purchased (order ' || v_order.order_id || ')');

  INSERT INTO client_credit_order_events (order_id, event_type, detail)
    VALUES (p_order_id, 'fulfilled',
      jsonb_build_object(
        'provider', p_provider,
        'provider_transaction_ref', p_provider_txn_ref,
        'credits_granted', v_order.credit_amount,
        'new_balance', v_new_balance
      ));

  RETURN jsonb_build_object(
    'success', true,
    'already_fulfilled', false,
    'order_id', v_order.order_id,
    'credits_granted', v_order.credit_amount,
    'credit_balance', v_new_balance
  );
END;
$$;

-- Internal only: no browser role, and not even PUBLIC, may execute this
REVOKE EXECUTE ON FUNCTION client_fulfill_paid_order(text, text, text, numeric, text) FROM PUBLIC, anon, authenticated;
