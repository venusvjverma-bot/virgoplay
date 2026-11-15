-- Update the trigger before dropping the column it references.
CREATE OR REPLACE FUNCTION public.sync_api_key_configured()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.api_key_configured := (NEW.api_key_enc IS NOT NULL AND length(NEW.api_key_enc) > 0);
  RETURN NEW;
END;
$$;

-- Drop the legacy plain-text key column.
-- All key material now lives exclusively in api_key_enc (AES-256-GCM encrypted).
ALTER TABLE public.provider_configurations
  DROP COLUMN IF EXISTS api_key;
