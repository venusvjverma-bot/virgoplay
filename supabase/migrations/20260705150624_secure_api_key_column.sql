-- Add write-only indicator so the UI can show "key configured" without reading the key.
ALTER TABLE public.provider_configurations
  ADD COLUMN IF NOT EXISTS api_key_configured boolean NOT NULL DEFAULT false;

-- Backfill existing rows.
UPDATE public.provider_configurations
SET api_key_configured = (api_key IS NOT NULL AND length(api_key) > 0);

-- Keep api_key_configured in sync whenever api_key changes.
CREATE OR REPLACE FUNCTION public.sync_api_key_configured()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.api_key_configured := (NEW.api_key IS NOT NULL AND length(NEW.api_key) > 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_api_key_configured ON public.provider_configurations;
CREATE TRIGGER trg_sync_api_key_configured
  BEFORE INSERT OR UPDATE ON public.provider_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_api_key_configured();

-- Revoke SELECT on the api_key column from all client roles.
-- Edge functions use the service role (superuser), which bypasses column-level
-- restrictions, so server-side reads are unaffected.
REVOKE SELECT (api_key) ON public.provider_configurations FROM authenticated;
REVOKE SELECT (api_key) ON public.provider_configurations FROM anon;
