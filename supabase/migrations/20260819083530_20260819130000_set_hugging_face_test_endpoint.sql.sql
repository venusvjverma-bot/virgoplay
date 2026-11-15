-- Set the test_endpoint for the Hugging Face provider to the Gradio config API.
-- The Gradio Space exposes /gradio_api/config as a lightweight GET endpoint
-- that returns JSON without generating an image. This lets the connection
-- test probe the correct API endpoint instead of the Space's HTML page.
UPDATE provider_configurations
SET test_endpoint = '/gradio_api/config'
WHERE provider_name = 'Hugging Face'
  AND service_type = 'image';