/*
# Create get_active_image_provider() RPC function

## Purpose
Role Image Production (RoleStudioPage) needs to know which image provider is
currently active so it can render the correct Generation Configuration fields
(ZenCreator vs Hugging Face). The `provider_configurations` table is locked
down by RLS to super admins only, so the Mother Creator cannot read it
directly. This SECURITY DEFINER function exposes ONLY the active image
provider's name — no API keys, URLs, endpoints, or any other configuration.

## New Function
- `get_active_image_provider()` — returns `text` (the `provider_name` of the
  active image provider, or `NULL` if none exists).

## Security
- SECURITY DEFINER: runs with the function owner's privileges, bypassing RLS
  on `provider_configurations`.
- Returns only `provider_name` — no sensitive columns.
- Granted to `authenticated` role so any signed-in creator can call it.
- No changes to existing RLS policies on `provider_configurations`.
*/

CREATE OR REPLACE FUNCTION public.get_active_image_provider()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_name text;
BEGIN
  SELECT pc.provider_name
  INTO v_provider_name
  FROM public.provider_configurations pc
  WHERE pc.service_type = 'image'
    AND pc.is_active = true
  LIMIT 1;

  RETURN v_provider_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_image_provider() TO authenticated;
