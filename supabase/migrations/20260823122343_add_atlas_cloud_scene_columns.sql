/*
# Add Atlas Cloud (Seedream) columns to scene_image_productions

## Purpose
Scene Image Production needs the same Atlas Cloud model-specific columns
that were added to character_roles in migration 20260823095154. When the
active image provider is Atlas Cloud, the scene_image_productions row must
store the Atlas-specific generation parameters so the edge function can
build the correct Seedream v5.0 Pro Edit payload.

## New Columns (all on scene_image_productions)
- gen_output_format (text, default 'jpeg') — Atlas output format: jpeg or png
- gen_thinking (text, default 'enabled') — Atlas thinking mode: enabled or disabled
- gen_prompt_optimization_mode (text, default 'standard') — Atlas optimization: standard or fast

## Notes
- gen_model already stores the Atlas model id (e.g. bytedance/seedream-v5.0-pro/edit)
- gen_ratio already stores the Atlas size string (e.g. 1530*2720)
- gen_number_of_images is always 1 for Atlas
- No RLS changes needed — existing policies already cover these columns
*/

ALTER TABLE public.scene_image_productions
  ADD COLUMN IF NOT EXISTS gen_output_format text DEFAULT 'jpeg',
  ADD COLUMN IF NOT EXISTS gen_thinking text DEFAULT 'enabled',
  ADD COLUMN IF NOT EXISTS gen_prompt_optimization_mode text DEFAULT 'standard';
