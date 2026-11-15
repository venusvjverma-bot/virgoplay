-- Add Atlas Cloud columns to character_studio_v2 for My AI generation config.
-- All columns are nullable so existing rows remain valid without backfill.
ALTER TABLE public.character_studio_v2
  ADD COLUMN IF NOT EXISTS my_ai_gen_output_format text,
  ADD COLUMN IF NOT EXISTS my_ai_gen_thinking text,
  ADD COLUMN IF NOT EXISTS my_ai_gen_prompt_optimization_mode text;

COMMENT ON COLUMN public.character_studio_v2.my_ai_gen_output_format IS 'Atlas Cloud output format for My AI generation (e.g. jpeg, png). Null when non-Atlas provider is active.';
COMMENT ON COLUMN public.character_studio_v2.my_ai_gen_thinking IS 'Atlas Cloud thinking mode for My AI generation (enabled/disabled). Null when non-Atlas provider is active.';
COMMENT ON COLUMN public.character_studio_v2.my_ai_gen_prompt_optimization_mode IS 'Atlas Cloud prompt optimization mode for My AI generation (standard/fast). Null when non-Atlas provider is active.';