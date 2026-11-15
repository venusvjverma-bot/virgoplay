-- Phase 3: Separate image message architecture
-- Adds message_type discriminator to companion_test_messages.
-- 'text' = dialogue message   (existing rows default to this)
-- 'image' = image package message (rendered as full-width image card)

ALTER TABLE companion_test_messages
  ADD COLUMN message_type text NOT NULL DEFAULT 'text'
  CHECK (message_type IN ('text', 'image'));

COMMENT ON COLUMN companion_test_messages.message_type IS
  'Message content type. text = standard dialogue bubble. '
  'image = full-width image card emitted by an image package (e.g. MT-IMG-001). '
  'image messages store the URL in image_url and content is empty.';
