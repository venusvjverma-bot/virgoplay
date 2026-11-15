/*
# Add Reasoning Level to LLM Chat Config

1. Purpose
   - Adds a persistent Reasoning Level setting to the existing LLM Chat Config
     (Super Admin → LLM Chat Config page), stored alongside the provider, model,
     temperature, max tokens, and status settings in `llm_chat_config`.

2. Modified Tables
   - `llm_chat_config`: adds one nullable text column `reasoning_level`
     (values: 'none' | 'low' | 'medium' | 'high'; NULL = not configured).
     No existing columns are changed; no rows are modified.

3. Security
   - No RLS, policy, or grant changes. The table already has RLS enabled with
     deny-by-default (no browser policies) — all access goes through the
     `save-llm-chat-config` edge function using the service role, which verifies
     super admin status. The new column is covered by the existing model.

4. Notes
   - Nullable with no default so existing config rows are untouched (NULL reads
     as "not set" and the admin UI shows None as the unselected placeholder).
   - CHECK constraint keeps the stored value inside the allowed set, matching
     the Venice.ai `reasoning_effort` documented values (none/low/medium/high).
     Venice also supports minimal/xhigh/max, but the admin requirement specifies
     these four UI options only.
*/
ALTER TABLE llm_chat_config
  ADD COLUMN IF NOT EXISTS reasoning_level text
  CHECK (reasoning_level IN ('none', 'low', 'medium', 'high'));
