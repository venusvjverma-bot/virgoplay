/*
 * Architecture Refinement — Scene Editor simplification
 *
 * 1. Add face_lock field to prompt_field_options with seed values
 * 2. Add face_lock_value column to scenario_scenes (stores selected instruction)
 *
 * face_lock is a reusable dropdown field (same as other prompt schema fields).
 * Users can create their own face lock instructions via "+ Add New".
 * Different AI models require different face-lock instructions.
 */

-- ── Seed face_lock options ───────────────────────────────────────────────

INSERT INTO prompt_field_options (field_name, option_value, sort_order, created_by)
VALUES
  ('face_lock', 'Keep the exact same face, body, hair and identity as the provided reference image.', 1, NULL),
  ('face_lock', 'Strictly preserve the exact same face and identity', 2, NULL),
  ('face_lock', 'Strictly preserve the exact same face, hair and identity', 3, NULL),
  ('face_lock', 'Maintain identical facial features, skin tone, and hair style', 4, NULL),
  ('face_lock', 'Preserve the exact same face with no alterations', 5, NULL)
ON CONFLICT (field_name, option_value) DO NOTHING;

-- ── Add face_lock_value to scenario_scenes ──────────────────────────────

ALTER TABLE scenario_scenes ADD COLUMN IF NOT EXISTS face_lock_value text;
