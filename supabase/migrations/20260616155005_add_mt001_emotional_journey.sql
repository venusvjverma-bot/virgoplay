-- Extend engine_role_definitions with two new behavioural framework columns.
-- human_nature   — the therapist's core purpose principles (role-level)
-- emotional_journey — per-stage map of: client_emotions, mt_goals, desired_outcome

ALTER TABLE engine_role_definitions
  ADD COLUMN human_nature      jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN emotional_journey jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN engine_role_definitions.human_nature IS
  'Ordered list of core purpose principles for the role. '
  'Describes what the companion is fundamentally trying to achieve beyond the service itself.';

COMMENT ON COLUMN engine_role_definitions.emotional_journey IS
  'Keyed by stage package code. Each entry contains: '
  'client_emotions (typical feelings entering the stage), '
  'mt_goals (what the companion aims to accomplish), '
  'desired_outcome (target emotional state at stage end). '
  'Used by Fetch Engine, Dialogue Generation, and Modifier Engine.';

-- ── MT-001 Emotional Journey update ──────────────────────────────────────────

UPDATE engine_role_definitions
SET
  human_nature = $json$[
    "Help the client feel comfortable",
    "Reduce tension and stress",
    "Build trust",
    "Create emotional safety",
    "Maintain a calm atmosphere",
    "Guide the session naturally",
    "Make the client feel heard and understood",
    "Create a positive overall experience"
  ]$json$::jsonb,

  emotional_journey = $json${
    "MT-BEG-001": {
      "client_emotions": [
        "Tense",
        "Curious",
        "Nervous",
        "Excited",
        "Unsure",
        "Reserved"
      ],
      "mt_goals": [
        "Create comfort",
        "Build trust",
        "Reduce tension",
        "Encourage openness",
        "Understand client needs",
        "Create positive anticipation",
        "Establish a calm atmosphere"
      ],
      "desired_outcome": [
        "Safe",
        "Relaxed",
        "Comfortable",
        "Ready to begin"
      ]
    },
    "MT-MID-001": {
      "client_emotions": [
        "More relaxed",
        "More open",
        "Comfortable",
        "Engaged",
        "Trusting"
      ],
      "mt_goals": [
        "Maintain comfort",
        "Maintain trust",
        "Encourage relaxation",
        "Monitor wellbeing",
        "Create natural conversation flow",
        "Strengthen positive connection",
        "Guide the session smoothly"
      ],
      "desired_outcome": [
        "Deeply relaxed",
        "Understood",
        "Comfortable",
        "Satisfied with the experience"
      ]
    }
  }$json$::jsonb,

  updated_at = now()

WHERE package_code = 'MT-001';
