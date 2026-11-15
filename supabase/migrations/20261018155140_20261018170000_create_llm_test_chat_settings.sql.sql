/*
# Create llm_test_chat_settings — per-creator System Prompt storage for LLM Test Chat

1. Purpose
   - Persists the System Prompt used on the LLM Test Chat page (Mother
     Creator testing tool) so it survives page refreshes and navigation.
   - One row per creator account (unique on creator_id). The Mother
     account test.test@gmail.com uses this page; other authenticated
     accounts each get their own isolated row.

2. New Table: llm_test_chat_settings
   - id (uuid, primary key, database-generated)
   - creator_id (uuid, NOT NULL, defaults to the signed-in user's id,
     references creators(id) ON DELETE CASCADE)
   - system_prompt (text, NOT NULL — the saved prompt text)
   - created_at, updated_at (timestamptz; updated_at maintained by trigger)

3. Security
   - RLS enabled. Owner-scoped CRUD for authenticated users only:
     each signed-in account can read/insert/update/delete ONLY the row
     where creator_id matches its own session (auth.uid() = creator_id).
   - No access for anonymous visitors. No service-role bypass changes.

4. Notes
   - Follows the existing per-creator settings pattern
     (character_studio_v2_settings): unique index + updated_at trigger.
   - The LLM Test Chat page loads this row on mount and saves via upsert;
     the llm-chat edge function is unchanged.
*/

CREATE TABLE IF NOT EXISTS llm_test_chat_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES creators(id) ON DELETE CASCADE,
  system_prompt text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE llm_test_chat_settings ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_llm_test_chat_settings_creator
  ON llm_test_chat_settings (creator_id);

DROP POLICY IF EXISTS "select_own_llm_test_chat_settings" ON llm_test_chat_settings;
CREATE POLICY "select_own_llm_test_chat_settings"
  ON llm_test_chat_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "insert_own_llm_test_chat_settings" ON llm_test_chat_settings;
CREATE POLICY "insert_own_llm_test_chat_settings"
  ON llm_test_chat_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "update_own_llm_test_chat_settings" ON llm_test_chat_settings;
CREATE POLICY "update_own_llm_test_chat_settings"
  ON llm_test_chat_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "delete_own_llm_test_chat_settings" ON llm_test_chat_settings;
CREATE POLICY "delete_own_llm_test_chat_settings"
  ON llm_test_chat_settings FOR DELETE
  TO authenticated
  USING (auth.uid() = creator_id);

CREATE OR REPLACE FUNCTION fn_llm_test_chat_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_llm_test_chat_settings_updated_at ON llm_test_chat_settings;
CREATE TRIGGER trg_llm_test_chat_settings_updated_at
  BEFORE UPDATE ON llm_test_chat_settings
  FOR EACH ROW
  EXECUTE FUNCTION fn_llm_test_chat_settings_updated_at();