/*
# LLM Chat Configuration Table

Stores LLM chat provider settings (Venice, etc.) separately from image
provider configurations. Only Super Admin can edit. The API key is
encrypted server-side and never sent to the browser — only an
`api_key_configured` boolean is exposed.

## Table: llm_chat_config
- id (uuid PK)
- provider_name (text, default 'Venice')
- base_url (text, default 'https://api.venice.ai/api/v1')
- api_key_enc (text — AES-256-GCM encrypted, server-side only)
- api_key_configured (boolean, default false — safe to expose)
- default_model (text, default 'venice-uncensored-1-2')
- temperature (real, default 0.8)
- max_tokens (integer, default 300)
- status (text, default 'Active' — 'Active' or 'Disabled')
- created_at, updated_at (timestamptz)

## Security
- RLS enabled, deny by default. No SELECT/INSERT/UPDATE/DELETE policies
  for anon or authenticated roles — all access goes through edge
  functions using the service role key, which verifies super admin
  status before reading/writing.
- api_key_enc is never selected by edge functions; only
  api_key_configured boolean is returned to the browser.
*/

CREATE TABLE IF NOT EXISTS llm_chat_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL DEFAULT 'Venice',
  base_url text NOT NULL DEFAULT 'https://api.venice.ai/api/v1',
  api_key_enc text,
  api_key_configured boolean NOT NULL DEFAULT false,
  default_model text NOT NULL DEFAULT 'venice-uncensored-1-2',
  temperature real NOT NULL DEFAULT 0.8,
  max_tokens integer NOT NULL DEFAULT 300,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE llm_chat_config ENABLE ROW LEVEL SECURITY;

-- No policies — deny by default. All access via edge functions (service role).
