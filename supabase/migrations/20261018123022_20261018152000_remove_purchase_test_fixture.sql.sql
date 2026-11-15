-- Remove the purchase test fixture client (test cleanup).
-- Cascades remove: its client_credit_orders rows, client_credit_order_events
-- (FK via order), client_sessions rows, and client_spending_history rows.
DELETE FROM clients WHERE id = '11111111-1111-4111-8111-111111111111';
