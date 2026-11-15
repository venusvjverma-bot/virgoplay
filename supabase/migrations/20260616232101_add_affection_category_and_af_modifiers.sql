-- RS003 Affection Level: replace 5-level numeric with 3-level category.
-- Old column (ai_rel_affection_level integer) is preserved; new column holds the category.

ALTER TABLE creator_profiles
  ADD COLUMN ai_rel_affection_category text
    NOT NULL
    DEFAULT 'Medium'
    CHECK (ai_rel_affection_category IN ('Low', 'Medium', 'High'));

COMMENT ON COLUMN creator_profiles.ai_rel_affection_category IS
  'RS003 affection level category. Low→AF-001, Medium→AF-002, High→AF-003.';

-- Add affection_modifiers column to engine_role_definitions.
ALTER TABLE engine_role_definitions
  ADD COLUMN affection_modifiers jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN engine_role_definitions.affection_modifiers IS
  'AF modifier definitions keyed by code (AF-001, AF-002, AF-003). '
  'Describes expression / presentation modifier behavior per attachment level.';

-- Seed AF modifier definitions for MT-001.
UPDATE engine_role_definitions
SET affection_modifiers = $j${
  "AF-001": {
    "label": "Low",
    "traits": [],
    "behavior": "No affection modifier. Base dialogue remains unchanged. No emojis, no nicknames, no additional warmth expressions."
  },
  "AF-002": {
    "label": "Medium",
    "traits": [
      "Add occasional warm personal expressions",
      "Add light personal references to the receiver",
      "Add suitable emojis when appropriate to the message context",
      "Keep dialogue meaning unchanged",
      "Do not alter conversation flow"
    ],
    "behavior": "Apply a light affection expression layer. Add warmth, personal touch, and suitable emojis while preserving the original dialogue meaning."
  },
  "AF-003": {
    "label": "High",
    "traits": [
      "Add stronger personal touches toward the receiver",
      "Add affectionate wording where appropriate",
      "Add context-appropriate emojis more frequently",
      "Maintain original dialogue meaning",
      "Do not change conversation logic or fetch paths"
    ],
    "behavior": "Apply the highest affection expression layer. Noticeably warmer and more expressive than AF-002, with more frequent emojis and affectionate language."
  }
}$j$::jsonb
WHERE package_code = 'MT-001';
