/*
# Add service_type and auth_method to provider_configurations

## Summary
Extends the existing provider_configurations table so it can manage multiple
categories of AI providers (image, chat, video, voice, etc.) instead of a
single global provider. Phase 1 uses this to migrate image generation off the
hardcoded FAL_KEY environment variable and onto a database-driven Image
Provider Library, while preserving the existing chat provider row.

## New Columns

### provider_configurations
| Column        | Type | Default  | Notes                                                   |
|---------------|------|----------|---------------------------------------------------------|
| service_type  | text | 'chat'   | 'image' \| 'chat' \| 'video' \| 'voice' \| 'other'      |
| auth_method   | text | 'bearer' | 'bearer' \| 'key' \| 'x-api-key' \| 'none'              |

- `service_type` categorizes which AI service category this provider serves.
  The single-active-provider trigger is now scoped per service_type, so there
  can be one active image provider AND one active chat provider simultaneously.
- `auth_method` controls how the decrypted API key is sent in the
  Authorization header when calling the provider:
    - 'bearer'   → `Authorization: Bearer <key>`
    - 'key'      → `Authorization: Key <key>`      (fal.ai style)
    - 'x-api-key'→ `x-api-key: <key>`
    - 'none'     → no auth header

## Modified Triggers
- `enforce_single_active_provider` now scopes the single-active constraint
  per service_type. Setting a row to is_active=true only deactivates other
  rows of the SAME service_type.

## Data Backfill
- The single existing row (RunPod, used by companion-chat) is backfilled to
  service_type='chat', auth_method='bearer'.

## Security
- RLS policies are unchanged — still super-admin only for all CRUD.
- Column-level privileges: auth_method is readable by client roles (it is not
  sensitive). service_type is also readable. api_key_enc remains write-only.

## Important Notes
1. The single-active constraint is now per-service-type, not global. This
   allows one active image provider and one active chat provider to coexist.
2. Existing chat functionality is unaffected — the backfilled row keeps its
   provider_name, provider_url, and encrypted key.
3. Image edge functions will read the active row WHERE service_type='image'.
*/

-- ── New columns ──────────────────────────────────────────────────────────────

ALTER TABLE public.provider_configurations
  ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'chat';

ALTER TABLE public.provider_configurations
  ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'bearer';

-- ── Backfill the existing chat row ───────────────────────────────────────────

UPDATE public.provider_configurations
SET    service_type = 'chat',
       auth_method  = 'bearer'
WHERE  service_type = 'chat'
  AND  provider_name = 'RunPod';

-- ── Constraints ──────────────────────────────────────────────────────────────

ALTER TABLE public.provider_configurations
  DROP CONSTRAINT IF EXISTS provider_config_service_type_chk;
ALTER TABLE public.provider_configurations
  ADD CONSTRAINT provider_config_service_type_chk
  CHECK (service_type IN ('image', 'chat', 'video', 'voice', 'other'));

ALTER TABLE public.provider_configurations
  DROP CONSTRAINT IF EXISTS provider_config_auth_method_chk;
ALTER TABLE public.provider_configurations
  ADD CONSTRAINT provider_config_auth_method_chk
  CHECK (auth_method IN ('bearer', 'key', 'x-api-key', 'none'));

-- ── Revoke SELECT on auth_method is NOT needed — it is not sensitive. ──────────
-- service_type and auth_method are safe for client roles to read.

-- ── Scoped single-active trigger ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_single_active_provider()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.provider_configurations
    SET    is_active = false
    WHERE  id <> NEW.id
      AND  service_type = NEW.service_type
      AND  is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger definition unchanged (same name, same columns) — the function body
-- above now scopes by service_type. Recreate to be safe.
DROP TRIGGER IF EXISTS trg_single_active_provider ON public.provider_configurations;
CREATE TRIGGER trg_single_active_provider
  AFTER INSERT OR UPDATE OF is_active ON public.provider_configurations
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION public.enforce_single_active_provider();

-- ── Index for the common query: active row per service type ───────────────────

CREATE INDEX IF NOT EXISTS idx_provider_config_service_active
  ON public.provider_configurations (service_type)
  WHERE is_active = true;
