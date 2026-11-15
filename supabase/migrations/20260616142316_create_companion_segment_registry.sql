-- companion_segment_registry
-- Authoritative reference table for all permanent AI Companion engine identifiers.
-- All packages, modifiers, session snapshots, and engine reads reference these codes.
-- Codes are permanent and must never be changed or reused.

CREATE TABLE companion_segment_registry (
  code           text        PRIMARY KEY,
  segment        text        NOT NULL,
  label          text        NOT NULL,
  description    text,
  profile_column text,          -- corresponding creator_profiles column (null = future/computed)
  blueprint_key  text,          -- key used in companion_test_sessions.blueprint JSONB
  value_type     text        NOT NULL DEFAULT 'text' CHECK (value_type IN ('text','integer','boolean','computed','action')),
  sort_order     integer     NOT NULL DEFAULT 0,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE companion_segment_registry IS
  'Permanent system identifiers for all AI Companion engine segments. '
  'Codes are stable references for Decision Engine, Fetch Engine, Smart Modifier, and Session Snapshot.';

ALTER TABLE companion_segment_registry ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users; only service role can mutate
CREATE POLICY "read_segment_registry" ON companion_segment_registry
  FOR SELECT TO authenticated USING (true);

-- ── Seed all segment codes ────────────────────────────────────────────────────

INSERT INTO companion_segment_registry
  (code, segment, label, description, profile_column, blueprint_key, value_type, sort_order)
VALUES

  -- AID: AI Identity
  ('AID001', 'AID', 'Name',
   'The AI companion''s display name',
   'ai_companion_name', 'AID001', 'text', 1),

  ('AID002', 'AID', 'Gender',
   'The AI companion''s gender',
   'ai_companion_gender', 'AID002', 'text', 2),

  ('AID003', 'AID', 'Age',
   'The AI companion''s age (18–60)',
   'ai_companion_age', 'AID003', 'integer', 3),

  -- PS: Personality
  ('PS001', 'PS', 'Core Personality',
   'Primary personality archetype (e.g. Sweet, Dominant, Playful)',
   'ai_companion_personality_type', 'PS001', 'text', 4),

  ('PS002', 'PS', 'Personality Intensity',
   'Strength of personality expression on a 1–5 scale',
   'ai_companion_personality_intensity', 'PS002', 'integer', 5),

  ('PS003', 'PS', 'Emotional Style',
   'Emotional tone and expression mode (e.g. Calm, Warm, Passionate)',
   'ai_companion_emotional_style', 'PS003', 'text', 6),

  ('PS004', 'PS', 'Flirting Style',
   'Romantic flirting intensity on a 1–5 scale',
   'ai_companion_flirting_style', 'PS004', 'integer', 7),

  ('PS005', 'PS', 'Personality Description',
   'Free-text creator narrative describing the companion''s personality',
   'ai_companion_personality_desc', 'PS005', 'text', 8),

  -- COM: Communication
  ('COM001', 'COM', 'Conversation Pace',
   'Speed and energy of dialogue (Fast / Balanced / Slow)',
   'ai_comm_conversation_pace', 'COM001', 'text', 9),

  ('COM002', 'COM', 'Initiative Level',
   'How often the companion leads conversation on a 1–5 scale',
   'ai_comm_initiative_level', 'COM002', 'integer', 10),

  ('COM003', 'COM', 'Response Length',
   'Target verbosity of responses (Short / Balanced / Detailed)',
   'ai_comm_response_length', 'COM003', 'text', 11),

  ('COM004', 'COM', 'Engagement Style',
   'How the companion participates in dialogue (Listener / Balanced / Leader)',
   'ai_comm_engagement_style', 'COM004', 'text', 12),

  ('COM005', 'COM', 'Story Guidance Level',
   'Degree of narrative direction provided (Minimal / Balanced / Strong)',
   'ai_comm_story_guidance', 'COM005', 'text', 13),

  ('COM006', 'COM', 'Conversation Consistency',
   'Adherence to established character framework on a 1–5 scale',
   'ai_comm_consistency', 'COM006', 'integer', 14),

  -- RS: Relationship Style
  ('RS001', 'RS', 'Relationship Dynamic',
   'The relational role and power dynamic (e.g. Equal, Protective, Submissive)',
   'ai_rel_dynamic', 'RS001', 'text', 15),

  ('RS002', 'RS', 'Attachment Level',
   'Attachment style and bonding pattern (e.g. Secure, Anxious, Avoidant)',
   'ai_rel_attachment', 'RS002', 'text', 16),

  ('RS003', 'RS', 'Affection Level',
   'Physical and emotional affection intensity on a 1–5 scale',
   'ai_rel_affection_level', 'RS003', 'integer', 17),

  ('RS004', 'RS', 'Relationship Description',
   'Free-text creator narrative describing the relationship dynamic',
   'ai_rel_description', 'RS004', 'text', 18),

  -- BP: Boundaries & Permissions
  ('BP001', 'BP', 'Media Permission',
   'Permitted media content types (Disabled / Limited / Enabled)',
   'ai_bp_media_permissions', 'BP001', 'text', 19),

  ('BP002', 'BP', 'Escalation Level',
   'Relationship escalation pace (Slow / Balanced / Fast)',
   'ai_bp_relationship_escalation', 'BP002', 'text', 20),

  ('BP003', 'BP', 'Interaction Permission',
   'Permitted interaction types — reserved for future implementation',
   NULL, 'BP003', 'text', 21),

  ('BP004', 'BP', 'Content Permission',
   'Permitted content categories — reserved for future implementation',
   NULL, 'BP004', 'text', 22),

  -- PV: Preview
  ('PV001', 'PV', 'Summary',
   'AI Companion configuration summary view — computed from all segments',
   NULL, 'PV001', 'computed', 23),

  ('PV002', 'PV', 'Completion Status',
   'Overall configuration completion percentage — computed',
   NULL, 'PV002', 'computed', 24),

  ('PV003', 'PV', 'Confirmation',
   'Creator consent and photo ownership confirmation',
   'creator_consent', 'PV003', 'boolean', 25),

  ('PV004', 'PV', 'Test Companion',
   'Engine test session initiation — creates an isolated Character Blueprint Snapshot',
   NULL, 'PV004', 'action', 26),

  ('PV005', 'PV', 'Publish Companion',
   'Companion publication action — makes companion available on creator portal',
   NULL, 'PV005', 'action', 27);
