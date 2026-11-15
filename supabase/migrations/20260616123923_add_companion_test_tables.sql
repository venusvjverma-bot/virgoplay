-- companion_test_sessions: immutable snapshot of the AI Companion config
-- at the moment the creator clicked "Test Companion". Profile changes after
-- session creation do NOT affect the active test session.
CREATE TABLE companion_test_sessions (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blueprint  jsonb       NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE companion_test_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_test_sessions" ON companion_test_sessions
  FOR SELECT TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "insert_own_test_sessions" ON companion_test_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "delete_own_test_sessions" ON companion_test_sessions
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);

-- companion_test_messages: dialogue history for a test session
CREATE TABLE companion_test_messages (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid        NOT NULL REFERENCES companion_test_sessions(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('user', 'companion')),
  content    text        NOT NULL,
  choices    jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX companion_test_messages_session_time_idx
  ON companion_test_messages (session_id, created_at);

ALTER TABLE companion_test_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_test_messages" ON companion_test_messages
  FOR SELECT TO authenticated USING (
    session_id IN (
      SELECT id FROM companion_test_sessions WHERE creator_id = auth.uid()
    )
  );

CREATE POLICY "insert_own_test_messages" ON companion_test_messages
  FOR INSERT TO authenticated WITH CHECK (
    session_id IN (
      SELECT id FROM companion_test_sessions WHERE creator_id = auth.uid()
    )
  );
