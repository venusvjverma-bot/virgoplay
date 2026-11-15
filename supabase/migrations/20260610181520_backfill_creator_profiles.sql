-- Insert missing creator_profiles rows for any creators that don't have one yet.
INSERT INTO creator_profiles (creator_id, display_name, bio, welcome_message, ai_personality, ai_system_prompt)
SELECT
  c.id,
  c.username,
  '',
  'Hey! Ask me anything.',
  '',
  ''
FROM creators c
LEFT JOIN creator_profiles cp ON cp.creator_id = c.id
WHERE cp.creator_id IS NULL;
