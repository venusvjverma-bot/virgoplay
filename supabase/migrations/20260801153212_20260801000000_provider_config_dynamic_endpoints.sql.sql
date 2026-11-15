/*
# Provider Configuration: Dynamic Endpoints & Provider Type

## Summary
Upgrades the provider_configurations table from a hardcoded-endpoint model to
a configuration-driven model. Instead of hardcoding provider-specific API
paths in edge-function source code (e.g. a `switch (providerName)` in
test-provider-connection), each row now stores its own endpoint paths. New
providers can be added purely through configuration (database rows + admin UI)
without editing source code.

A new `provider_type` column replaces the narrow `service_type` concept with a
capability selector that supports multi-capability providers (e.g. an image +
video provider like ZenCreator). The existing `service_type` column is kept
for backward compatibility — generation functions still query by service_type,
and provider_type provides the richer capability metadata.

## New Columns

### provider_configurations
| Column                       | Type | Default       | Notes                                              |
|------------------------------|------|---------------|----------------------------------------------------|
| provider_type                | text | 'image'       | 'image' \| 'video' \| 'image+video' \| 'chat' \| 'audio' \| 'multi-modal' |
| test_endpoint                | text | ''            | Path appended to base URL for connection testing   |
| asset_upload_endpoint        | text | ''            | Path for uploading assets to the provider          |
| generation_endpoint          | text | ''            | Path for creating a new generation                 |
| generation_status_endpoint   | text | ''            | Path for polling generation status (may contain {generation_id}) |
| generation_result_endpoint   | text | ''            | Path for fetching the final result (may contain {generation_id}) |

- `provider_type` describes what the provider can generate. Multiple providers
  of different types can coexist. The single-active-provider trigger still
  scopes by `service_type` (unchanged) so e.g. one active image + one active
  chat provider can coexist.
- The five endpoint columns store path templates relative to `provider_url`.
  They may contain the placeholder `{generation_id}` which the caller replaces
  at runtime. Empty string means "not applicable / not configured".

## Data Backfill
Existing rows are backfilled with known endpoint paths so they keep working:

| Provider   | service_type | test_endpoint              | generation_endpoint         |
|------------|--------------|----------------------------|-----------------------------|
| ZenCreator | image        | /api/public/v1/tools       | /api/public/v1/generations  |
| Fal.ai     | image        | /                          | (empty — uses fal.run paths)|
| Promptchan | image        | /api/external/create       | /api/external/create        |
| RunPod     | chat         | /health                    | (empty — chat uses its own) |

ZenCreator is also set to provider_type='image+video' per the example spec.

## Security
- RLS policies are unchanged — still super-admin only for all CRUD.
- New columns are non-sensitive (paths only, no secrets) and readable by
  client roles through the existing super-admin SELECT policy.
- No changes to api_key_enc encryption or column-level privileges.

## Important Notes
1. This migration is additive only — no columns are dropped or renamed.
2. The existing `service_type` column and its single-active trigger are
   preserved. `provider_type` is a richer capability descriptor that does not
   affect the trigger logic.
3. Existing generation edge functions are NOT modified — they continue to
   work as before. The new endpoint columns are available for future use and
   for the Test Connection feature, which now reads `test_endpoint` from the
   database instead of hardcoding paths per provider name.
4. A CHECK constraint limits provider_type to the allowed capability values.
*/

-- ── New columns ──────────────────────────────────────────────────────────────

ALTER TABLE public.provider_configurations
  ADD COLUMN IF NOT EXISTS provider_type text NOT NULL DEFAULT 'image';

ALTER TABLE public.provider_configurations
  ADD COLUMN IF NOT EXISTS test_endpoint text NOT NULL DEFAULT '';

ALTER TABLE public.provider_configurations
  ADD COLUMN IF NOT EXISTS asset_upload_endpoint text NOT NULL DEFAULT '';

ALTER TABLE public.provider_configurations
  ADD COLUMN IF NOT EXISTS generation_endpoint text NOT NULL DEFAULT '';

ALTER TABLE public.provider_configurations
  ADD COLUMN IF NOT EXISTS generation_status_endpoint text NOT NULL DEFAULT '';

ALTER TABLE public.provider_configurations
  ADD COLUMN IF NOT EXISTS generation_result_endpoint text NOT NULL DEFAULT '';

-- ── Constraints ──────────────────────────────────────────────────────────────

ALTER TABLE public.provider_configurations
  DROP CONSTRAINT IF EXISTS provider_config_provider_type_chk;
ALTER TABLE public.provider_configurations
  ADD CONSTRAINT provider_config_provider_type_chk
  CHECK (provider_type IN ('image', 'video', 'image+video', 'chat', 'audio', 'multi-modal'));

-- ── Backfill existing rows with known endpoint paths ──────────────────────────

UPDATE public.provider_configurations
SET    provider_type           = 'image+video',
       test_endpoint           = '/api/public/v1/tools',
       asset_upload_endpoint    = '/api/public/v1/assets',
       generation_endpoint      = '/api/public/v1/generations',
       generation_status_endpoint   = '/api/public/v1/generations/{generation_id}',
       generation_result_endpoint   = '/api/public/v1/generations/{generation_id}/result'
WHERE  provider_name = 'ZenCreator';

UPDATE public.provider_configurations
SET    provider_type           = 'image',
       test_endpoint           = '/'
WHERE  provider_name = 'Fal.ai';

UPDATE public.provider_configurations
SET    provider_type           = 'image',
       test_endpoint           = '/api/external/create',
       generation_endpoint      = '/api/external/create'
WHERE  provider_name = 'Promptchan';

UPDATE public.provider_configurations
SET    provider_type           = 'chat',
       test_endpoint           = '/health'
WHERE  provider_name = 'RunPod';
