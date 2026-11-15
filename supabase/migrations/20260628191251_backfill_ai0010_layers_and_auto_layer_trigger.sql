-- ── 1. Backfill missing ai_identity_layers rows for AI-0010 ──────────────────
--
-- AI-0010 was created after the layered_identity_architecture backfill migration
-- (20260628075926) ran, so it never received its layer rows. The generate-ai-identity
-- edge function already inserts layers for identities it creates, but AI-0010
-- predates the deployed version that included that insertion.

INSERT INTO ai_identity_layers
  (identity_id, creator_id, layer_code, layer_type, layer_name, source_ref,
   layer_status, is_canonical_body, metadata, sort_order)
SELECT
  m.id,
  m.creator_id,
  m.identity_code || '-A',
  'body',
  'Canonical Body Asset — ' || m.bt_name,
  m.bt_code,
  'canonical',
  true,
  jsonb_build_object(
    'canonical',          true,
    'body_asset_version', 1,
    'backfilled',         true,
    'backfill_reason',    'Identity predated edge function layer insertion. Rows created by backfill migration.',
    'identity', jsonb_build_object(
      'identity_code',   m.identity_code,
      'linked_apr_code', m.apr_code,
      'linked_apr_name', m.apr_name,
      'linked_bt_code',  m.bt_code,
      'linked_bt_name',  m.bt_name
    )
  ),
  1
FROM master_ai_identities m
WHERE m.identity_code = 'AI-0010'
ON CONFLICT (identity_id, layer_code) DO NOTHING;

INSERT INTO ai_identity_layers
  (identity_id, creator_id, layer_code, layer_type, layer_name, source_ref,
   layer_status, is_canonical_body, metadata, sort_order)
SELECT
  m.id,
  m.creator_id,
  m.identity_code || '-B',
  'base_clothing',
  'Base Clothing — ' || m.bt_name || ' default',
  m.bt_code,
  'reference_only',
  false,
  jsonb_build_object(
    'canonical',              false,
    'clothing_layer_version', 1,
    'backfilled',             true,
    'backfill_reason',        'Identity predated edge function layer insertion. Rows created by backfill migration.',
    'identity', jsonb_build_object(
      'identity_code',  m.identity_code,
      'linked_bt_code', m.bt_code,
      'linked_bt_name', m.bt_name
    )
  ),
  2
FROM master_ai_identities m
WHERE m.identity_code = 'AI-0010'
ON CONFLICT (identity_id, layer_code) DO NOTHING;


-- ── 2. Auto-layer trigger ──────────────────────────────────────────────────────
--
-- Creates the two required ai_identity_layers stubs (body + base_clothing)
-- immediately after any new master_ai_identities row is inserted. This is the
-- safety net ensuring layers always exist regardless of how an identity is
-- created (edge function, migration, direct insert, future tooling).
--
-- The edge function also inserts layers with full metadata. To avoid conflicts,
-- the trigger uses ON CONFLICT DO NOTHING — the edge function's richer upsert
-- takes precedence over these minimal stubs when it runs.

CREATE OR REPLACE FUNCTION fn_auto_create_identity_layers()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ai_identity_layers
    (identity_id, creator_id, layer_code, layer_type, layer_name, source_ref,
     layer_status, is_canonical_body, metadata, sort_order)
  VALUES
    (
      NEW.id,
      NEW.creator_id,
      NEW.identity_code || '-A',
      'body',
      'Canonical Body Asset — ' || COALESCE(NEW.bt_name, NEW.bt_code),
      NEW.bt_code,
      'canonical',
      true,
      jsonb_build_object(
        'canonical',          true,
        'body_asset_version', 1,
        'auto_created',       true,
        'identity', jsonb_build_object(
          'identity_code',   NEW.identity_code,
          'linked_apr_code', NEW.apr_code,
          'linked_apr_name', NEW.apr_name,
          'linked_bt_code',  NEW.bt_code,
          'linked_bt_name',  NEW.bt_name
        )
      ),
      1
    ),
    (
      NEW.id,
      NEW.creator_id,
      NEW.identity_code || '-B',
      'base_clothing',
      'Base Clothing — ' || COALESCE(NEW.bt_name, NEW.bt_code) || ' default',
      NEW.bt_code,
      'reference_only',
      false,
      jsonb_build_object(
        'canonical',              false,
        'clothing_layer_version', 1,
        'auto_created',           true,
        'identity', jsonb_build_object(
          'identity_code',  NEW.identity_code,
          'linked_bt_code', NEW.bt_code,
          'linked_bt_name', NEW.bt_name
        )
      ),
      2
    )
  ON CONFLICT (identity_id, layer_code) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_identity_layers ON master_ai_identities;

CREATE TRIGGER trg_auto_create_identity_layers
  AFTER INSERT ON master_ai_identities
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_create_identity_layers();
