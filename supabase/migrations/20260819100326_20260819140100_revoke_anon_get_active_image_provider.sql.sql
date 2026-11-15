/*
# Tighten get_active_image_provider() execute permissions

The default GRANT gives EXECUTE to `public` (which includes `anon`).
Revoke from `public` and `anon` so only authenticated creators can call it.
*/

REVOKE EXECUTE ON FUNCTION public.get_active_image_provider() FROM public;
REVOKE EXECUTE ON FUNCTION public.get_active_image_provider() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_active_image_provider() TO authenticated;
