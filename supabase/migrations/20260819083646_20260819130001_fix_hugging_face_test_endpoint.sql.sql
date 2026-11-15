-- Correct the test_endpoint for Hugging Face provider.
-- This Gradio Space exposes /config (not /gradio_api/config) as the
-- lightweight JSON config endpoint for connection testing.
UPDATE provider_configurations
SET test_endpoint = '/config'
WHERE provider_name = 'Hugging Face'
  AND service_type = 'image';