-- Add encrypted API key column.
-- All writes to key columns are forced through the save-provider-config edge
-- function (service role). Client roles can never read or write these columns.
ALTER TABLE public.provider_configurations
  ADD COLUMN IF NOT EXISTS api_key_enc text;

-- Revoke read access to the encrypted column from client roles.
-- Service role (superuser) bypasses column-level restrictions automatically.
REVOKE SELECT (api_key_enc) ON public.provider_configurations FROM authenticated;
REVOKE SELECT (api_key_enc) ON public.provider_configurations FROM anon;

-- Revoke direct INSERT / UPDATE on both key columns from client roles.
-- The save-provider-config edge function writes via service role.
REVOKE INSERT (api_key,     api_key_enc) ON public.provider_configurations FROM authenticated;
REVOKE UPDATE (api_key,     api_key_enc) ON public.provider_configurations FROM authenticated;
REVOKE INSERT (api_key,     api_key_enc) ON public.provider_configurations FROM anon;
REVOKE UPDATE (api_key,     api_key_enc) ON public.provider_configurations FROM anon;

-- Update the api_key_configured indicator: true when either field holds a value.
CREATE OR REPLACE FUNCTION public.sync_api_key_configured()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.api_key_configured := (
    (NEW.api_key     IS NOT NULL AND length(NEW.api_key)     > 0) OR
    (NEW.api_key_enc IS NOT NULL AND length(NEW.api_key_enc) > 0)
  );
  RETURN NEW;
END;
$$;
