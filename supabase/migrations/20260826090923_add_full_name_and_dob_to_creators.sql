-- Add nullable full_name and dob columns to creators table.
-- Both columns are nullable so existing creator rows remain valid without backfill.
ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS dob date;

-- Comment for clarity (private fields, not displayed publicly)
COMMENT ON COLUMN public.creators.full_name IS 'Private full name of the creator. Not displayed publicly. Collected at signup.';
COMMENT ON COLUMN public.creators.dob IS 'Private date of birth of the creator. Not displayed publicly. Collected at signup.';

-- No changes to existing RLS policies: these columns inherit the same row-level
-- access as the rest of the creators table (owner can read/write own row).
-- They are NOT added to any public view or profile endpoint.