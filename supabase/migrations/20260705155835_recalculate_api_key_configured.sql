-- Recalculate api_key_configured for all rows now that api_key is gone.
-- Any row where api_key_enc is null or empty should show false.
UPDATE public.provider_configurations
SET api_key_configured = (api_key_enc IS NOT NULL AND length(api_key_enc) > 0);
