-- Fix client_get_purchase_history: the jsonb_agg ORDER BY referenced the
-- jsonb_build_object alias `order_row`, which is out of scope in that clause,
-- so every authenticated call failed with
-- "missing FROM-clause entry for table order_row".
-- Rebuilt to sort on the underlying column o.created_at instead.
-- Signature, session-token verification, and per-client ownership unchanged.

CREATE OR REPLACE FUNCTION client_get_purchase_history(
  p_client_id     uuid,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT verify_client_session(p_client_id, p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: invalid or expired session');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'orders', (
      SELECT COALESCE(jsonb_agg(row_data ORDER BY o.created_at DESC), '[]'::jsonb)
      FROM client_credit_orders o
      CROSS JOIN LATERAL (
        SELECT jsonb_build_object(
          'order_id', o.order_id,
          'package_id', o.package_id,
          'package_name', o.package_name,
          'credit_amount', o.credit_amount,
          'price_amount', o.price_amount,
          'currency', o.currency,
          'payment_provider', o.payment_provider,
          'provider_transaction_ref', o.provider_transaction_ref,
          'status', o.status,
          'created_at', o.created_at,
          'updated_at', o.updated_at
        ) AS row_data
      ) rd
      WHERE o.client_id = p_client_id
    )
  );
END;
$$;