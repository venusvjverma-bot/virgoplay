/*
# Phase 3A.1 Fix — Replace Prompt Field Option Seeds

## Summary
Replaces all seed values in `prompt_field_options` with exactly the approved
initial values from the Universal Prompt Schema specification. All previous
invented/placeholder options are removed so the dropdowns show only the
approved set.

## Changes
1. DELETE all existing rows from `prompt_field_options` (these were placeholder
   values invented during initial scaffolding — not approved seed data).
2. INSERT exactly the approved initial values for each field, with sort_order
   matching the order specified in the requirements.

## Security
No schema or policy changes. RLS remains enabled with existing policies.

## Notes
- User-created options (created_by IS NOT NULL) are also removed. This is
  intentional — the previous seed data was not approved and the dropdowns must
  start clean with only the approved values.
- The table schema itself is unchanged.
*/

DELETE FROM prompt_field_options;

INSERT INTO prompt_field_options (field_name, option_value, sort_order, created_by)
VALUES
  -- ethnicity
  ('ethnicity', 'East Asian', 1, NULL),
  -- age
  ('age', 'Young', 1, NULL),
  -- hair
  ('hair', 'Long wavy reddish-brown hair', 1, NULL),
  -- face
  ('face', 'Elegant beautiful face', 1, NULL),
  -- skin_type
  ('skin_type', 'Fair smooth skin', 1, NULL),
  -- body
  ('body', 'Curvy figure, slim waist, wide hips', 1, NULL),
  -- breasts
  ('breasts', 'Large full round natural breasts', 1, NULL),
  -- clothing
  ('clothing', 'Completely nude', 1, NULL),
  -- pose
  ('pose', 'Sexy arched pose', 1, NULL),
  ('pose', 'Doggystyle position', 2, NULL),
  ('pose', 'Kneeling, looking up', 3, NULL),
  -- expression
  ('expression', 'Soft seductive', 1, NULL),
  ('expression', 'Pleasure / moaning', 2, NULL),
  ('expression', 'Satisfied, aroused', 3, NULL),
  -- action
  ('action', 'Looking at camera', 1, NULL),
  ('action', 'Being penetrated from behind', 2, NULL),
  ('action', 'Cum on face', 3, NULL),
  -- partner
  ('partner', 'None', 1, NULL),
  ('partner', 'Muscular male partner', 2, NULL),
  -- camera_angle
  ('camera_angle', 'Front view', 1, NULL),
  ('camera_angle', 'Side-rear view', 2, NULL),
  ('camera_angle', 'Front / slightly high angle', 3, NULL),
  -- style
  ('style', '85% photorealistic, 15% light CGI polish', 1, NULL),
  -- lighting
  ('lighting', 'Soft warm lighting', 1, NULL),
  -- atmosphere
  ('atmosphere', 'Erotic', 1, NULL),
  -- extra_details
  ('extra_details', 'One hand on thigh', 1, NULL),
  ('extra_details', 'Breasts hanging, penetration visible', 2, NULL),
  ('extra_details', 'Cum dripping on face & breasts', 3, NULL)
ON CONFLICT (field_name, option_value) DO NOTHING;
