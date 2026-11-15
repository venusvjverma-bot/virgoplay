/*
# Create provider_configurations table

## Summary
Creates the platform-level Provider Configuration table. This table stores
external AI provider credentials (URL, API key, health endpoint) and tracks
live connection health status. It is part of the Platform Development Layer —
NOT a creator feature. Child creator accounts have zero access.

## New Tables

### provider_configurations
Stores one row per configured external AI provider.

| Column             | Type         | Notes                                      |
|--------------------|--------------|---------------------------------------------|
| id                 | uuid PK      | Generated automatically                     |
| provider_name      | text         | RunPod, OpenAI, Anthropic, Ollama, Custom  |
| provider_url       | text         | Base URL, e.g. https://xxx.proxy.runpod.net |
| api_key            | text         | Provider API key (server-side reads only)   |
| health_endpoint    | text         | Path for health check, default /health      |
| connection_status  | text         | connected | offline | unknown               |
| health_status      | text         | healthy | unhealthy | n/a                   |
| is_active          | boolean      | True for the currently active provider      |
| last_health_check  | timestamptz  | When the last health check was performed    |
| created_at         | timestamptz  | Row creation timestamp                      |
| updated_at         | timestamptz  | Auto-updated on every write                 |

## Security

RLS is enabled. All four CRUD policies scope access to `is_super_admin()` only.
- No anon access.
- No regular admin access.
- Only the Mother Platform Super Admin account can read or write this table
  through the browser client.
- Edge functions use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS (server-side
  only — never exposed to the browser).

## Important Notes

1. SINGLE ACTIVE ROW: Only one row should have is_active = true at a time.
   A trigger enforces this — setting a new row to is_active = true
   automatically sets all other rows to is_active = false.
2. UPDATED_AT TRIGGER: An auto-update trigger keeps updated_at current on
   every write.
3. API KEY SECURITY: The api_key column is readable only through the
   super-admin RLS policy. The browser client of a non-super-admin session
   will receive zero rows from this table.
*/

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_configurations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name     text        NOT NULL,
  provider_url      text        NOT NULL DEFAULT '',
  api_key           text        NOT NULL DEFAULT '',
  health_endpoint   text        NOT NULL DEFAULT '/health',
  connection_status text        NOT NULL DEFAULT 'unknown',
  health_status     text        NOT NULL DEFAULT 'n/a',
  is_active         boolean     NOT NULL DEFAULT true,
  last_health_check timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ── updated_at auto-trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_provider_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provider_config_updated_at ON public.provider_configurations;
CREATE TRIGGER trg_provider_config_updated_at
  BEFORE UPDATE ON public.provider_configurations
  FOR EACH ROW EXECUTE FUNCTION public.set_provider_config_updated_at();

-- ── Single-active-provider trigger ───────────────────────────────────────────
-- When a row is inserted or updated with is_active = true,
-- all other rows are automatically set to is_active = false.

CREATE OR REPLACE FUNCTION public.enforce_single_active_provider()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.provider_configurations
    SET    is_active = false
    WHERE  id <> NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_active_provider ON public.provider_configurations;
CREATE TRIGGER trg_single_active_provider
  AFTER INSERT OR UPDATE OF is_active ON public.provider_configurations
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION public.enforce_single_active_provider();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.provider_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_select_provider_config" ON public.provider_configurations;
CREATE POLICY "superadmin_select_provider_config"
  ON public.provider_configurations FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "superadmin_insert_provider_config" ON public.provider_configurations;
CREATE POLICY "superadmin_insert_provider_config"
  ON public.provider_configurations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "superadmin_update_provider_config" ON public.provider_configurations;
CREATE POLICY "superadmin_update_provider_config"
  ON public.provider_configurations FOR UPDATE
  TO authenticated
  USING  (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "superadmin_delete_provider_config" ON public.provider_configurations;
CREATE POLICY "superadmin_delete_provider_config"
  ON public.provider_configurations FOR DELETE
  TO authenticated
  USING (public.is_super_admin());
