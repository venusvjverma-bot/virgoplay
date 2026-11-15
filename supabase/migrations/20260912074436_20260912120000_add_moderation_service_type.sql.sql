/*
# Add 'moderation' to provider_configurations service_type

## Summary
Adds 'moderation' as a valid service_type value on the existing
provider_configurations table. This allows a Super Admin to configure
a content moderation / safety provider (e.g. Hive) using the same
architecture as image/video/chat providers — no new table, no new
columns, no new RLS policies.

## Changes
- Drops and recreates the CHECK constraint on provider_configurations.service_type
  to include 'moderation' alongside the existing values.
- The single-active-provider trigger already scopes by service_type, so
  one active moderation provider can coexist with one active image provider
  and one active chat provider.

## Security
- No RLS policy changes. The existing super-admin-only CRUD policies on
  provider_configurations apply to moderation rows identically.
- No new columns. The existing api_key_enc column and its column-level
  REVOKE on authenticated/anon roles protect the moderation API key.

## Important Notes
1. This migration is additive only — no columns are dropped or renamed.
2. The enforce_single_active_provider trigger function already scopes by
   service_type, so moderation providers get their own active slot.
3. No backfill is needed — no moderation providers exist yet.
*/

ALTER TABLE public.provider_configurations
  DROP CONSTRAINT IF EXISTS provider_config_service_type_chk;

ALTER TABLE public.provider_configurations
  ADD CONSTRAINT provider_config_service_type_chk
  CHECK (service_type IN ('image', 'chat', 'video', 'voice', 'moderation', 'other'));
