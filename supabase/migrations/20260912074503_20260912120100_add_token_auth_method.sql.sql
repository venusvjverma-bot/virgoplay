/*
# Add 'token' auth method to provider_configurations

## Summary
Adds 'token' as a valid auth_method value on the existing
provider_configurations table. Hive's API uses
`Authorization: Token <key>` — distinct from the existing 'key' method
which sends `Authorization: Key <key>`. This allows Hive and any other
provider using the `Token` prefix to be configured correctly.

## Changes
- Drops and recreates the CHECK constraint on
  provider_configurations.auth_method to include 'token'.

## Security
- No RLS or column-level privilege changes. auth_method is non-sensitive
  metadata readable by client roles.
*/

ALTER TABLE public.provider_configurations
  DROP CONSTRAINT IF EXISTS provider_config_auth_method_chk;

ALTER TABLE public.provider_configurations
  ADD CONSTRAINT provider_config_auth_method_chk
  CHECK (auth_method IN ('bearer', 'key', 'token', 'x-api-key', 'none'));
