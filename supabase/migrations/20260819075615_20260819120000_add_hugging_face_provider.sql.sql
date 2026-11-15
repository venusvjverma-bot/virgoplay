/*
# Add Hugging Face as an independent image provider

## Summary
Inserts a new row in provider_configurations for the Hugging Face Qwen Image
Edit Gradio API. This is a completely independent provider record — it does
NOT touch, overwrite, or modify any existing provider (ZenCreator, Fal.ai,
Promptchan, RunPod).

The new row is inserted with is_active = false so it does NOT deactivate the
currently active image provider. The super admin can activate it through the
existing Image Provider Library UI when ready.

## New Row
| Field                          | Value                                                          |
|--------------------------------|----------------------------------------------------------------|
| provider_name                  | Hugging Face                                                   |
| provider_url                   | https://prithivmlmods-qwen-image-edit-2511-loras-fast.hf.space |
| service_type                   | image                                                          |
| provider_type                  | image                                                          |
| auth_method                    | bearer                                                         |
| api_key_enc                    | (empty — no token by default; super admin can set via UI)      |
| generation_endpoint            | /gradio_api/call/v2/edit_image                                 |
| generation_status_endpoint     | /gradio_api/call/edit_image/{generation_id}                    |
| generation_result_endpoint     | (empty — SSE stream returns result inline)                     |
| test_endpoint                  | (empty — Gradio spaces have no standard health endpoint)        |
| asset_upload_endpoint          | (empty — HF takes inline base64 data URLs)                     |
| is_active                      | false                                                          |

## Security
- RLS unchanged — super-admin only for all CRUD.
- api_key_enc is empty initially; when the super admin saves a token through
  the UI, save-provider-config encrypts it.

## Important Notes
1. This migration is INSERT-only. No UPDATE or DELETE of existing rows.
2. is_active = false ensures the currently active image provider is unaffected.
3. The single-active-provider trigger will only fire when the super admin
   explicitly sets is_active = true through the UI.
*/

INSERT INTO public.provider_configurations (
  provider_name,
  provider_url,
  api_key_enc,
  service_type,
  provider_type,
  auth_method,
  is_active,
  test_endpoint,
  asset_upload_endpoint,
  generation_endpoint,
  generation_status_endpoint,
  generation_result_endpoint,
  connection_status,
  health_status
) VALUES (
  'Hugging Face',
  'https://prithivmlmods-qwen-image-edit-2511-loras-fast.hf.space',
  NULL,
  'image',
  'image',
  'bearer',
  false,
  '',
  '',
  '/gradio_api/call/v2/edit_image',
  '/gradio_api/call/edit_image/{generation_id}',
  '',
  'unknown',
  'n/a'
)
ON CONFLICT DO NOTHING;
