-- Add Atlas Cloud (Seedream) model-specific columns to character_roles.
-- These store the Mother Account's per-role Atlas configuration:
--   gen_output_format          → jpeg / png
--   gen_thinking               → enabled / disabled
--   gen_prompt_optimization_mode → standard / fast
--
-- gen_model and gen_ratio already exist and are reused:
--   gen_model  stores the Atlas model id (e.g. bytedance/seedream-v5.0-pro/edit)
--   gen_ratio  stores the Atlas size string (e.g. 2048*2048)
--   gen_number_of_images is always 1 for Atlas (model outputs a single image)

ALTER TABLE public.character_roles
  ADD COLUMN IF NOT EXISTS gen_output_format text DEFAULT 'jpeg',
  ADD COLUMN IF NOT EXISTS gen_thinking text DEFAULT 'enabled',
  ADD COLUMN IF NOT EXISTS gen_prompt_optimization_mode text DEFAULT 'standard';
