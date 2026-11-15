-- Fix Atlas Cloud provider endpoints to match the official Atlas Cloud API docs
-- for the bytedance/seedream-v5.0-pro/edit model.
--
-- Problems fixed:
--   1. test_endpoint was set to /api/v1/model/generateImage (POST-only).
--      The Test Connection function issues a GET request, so the POST-only
--      endpoint returned HTTP 404. Changed to /v1/models — the OpenAI-
--      compatible GET endpoint that returns JSON and uses the same API key.
--   2. generation_result_endpoint was a duplicate of the prediction/status
--      endpoint. The docs define a separate /api/v1/model/result/{request_id}
--      endpoint for retrieving the final generated media.
--   3. asset_upload_endpoint was empty. The docs define
--      /api/v1/model/uploadMedia for media uploads (reference images).
--
-- No architecture, code, or model configuration changes — endpoint paths only.

UPDATE public.provider_configurations
SET
  test_endpoint              = '/v1/models',
  generation_result_endpoint = '/api/v1/model/result/{generation_id}',
  asset_upload_endpoint      = '/api/v1/model/uploadMedia',
  updated_at                 = now()
WHERE provider_name = 'Atlas Cloud'
  AND service_type   = 'image';
