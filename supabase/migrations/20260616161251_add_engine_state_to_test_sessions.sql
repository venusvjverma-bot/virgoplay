-- Add engine_state to companion_test_sessions.
-- Tracks the Fetch Engine cursor: current package, seq, path, and transition status.
-- Updated by the companion-chat edge function as each record is served.

ALTER TABLE companion_test_sessions
  ADD COLUMN engine_state jsonb;

COMMENT ON COLUMN companion_test_sessions.engine_state IS
  'Fetch Engine cursor. Shape: {mode, package_code, seq, path, next_seq, next_path, is_terminal, transition_to}. '
  'null = session has not started yet or is in AI generation mode.';

-- Edge function runs as the authenticated user (anon key + user JWT).
-- Allow the user to advance their own engine state.
CREATE POLICY "update_own_test_sessions" ON companion_test_sessions
  FOR UPDATE TO authenticated
  USING  (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);
