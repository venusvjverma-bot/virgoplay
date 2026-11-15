/*
# Add video_generation_endpoint to provider_configurations

## Purpose
Providers that support both image and video generation (like Atlas Cloud)
may use different API paths for each modality. Today the table has a single
`generation_endpoint` used for image generation. This migration adds a
separate `video_generation_endpoint` column so a provider can expose a
distinct path for video generation while sharing the existing status,
result, and upload endpoints.

## New Column
- `video_generation_endpoint` (text, default '') — API path appended to the
  provider base URL for video generation requests. When empty, video
  generation falls back to `generation_endpoint`.

## Backfill
- Atlas Cloud (service_type='image') is set to `/api/v1/model/generateVideo`
  so it is ready for video generation alongside its existing
  `/api/v1/model/generateImage` image endpoint.

## Notes
- The existing `generation_status_endpoint`, `generation_result_endpoint`,
  and `asset_upload_endpoint` are shared across image and video — no
  duplicate columns needed for those.
- No RLS changes — the column is covered by existing policies.
*/

ALTER TABLE public.provider_configurations
  ADD COLUMN IF NOT EXISTS video_generation_endpoint text NOT NULL DEFAULT '';

UPDATE public.provider_configurations
  SET video_generation_endpoint = '/api/v1/model/generateVideo'
  WHERE service_type = 'image'
    AND LOWER(provider_name) LIKE '%atlas%'
    AND video_generation_endpoint = '';
