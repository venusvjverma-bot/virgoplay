/*
# Add taxonomy columns to creator_profiles

## Summary
Adds three text-array columns to creator_profiles so creators can tag themselves
with categories, personality traits, and the services they offer.

## New Columns (creator_profiles)

- categories text[] NOT NULL DEFAULT '{}'
  Broad profile type tags (e.g. "AI GFE", "AI Wife", "Romantic Partner").

- personality_traits text[] NOT NULL DEFAULT '{}'
  Descriptive personality labels (e.g. "Romantic", "Playful", "Dominant").

- services_offered text[] NOT NULL DEFAULT '{}'
  Services the creator's AI persona provides (e.g. "Text Chat", "Fantasy Roleplay").

## Notes

- All columns default to empty array so existing rows remain valid immediately.
- Statements are idempotent via DO $$ IF NOT EXISTS $$ guards.
- No RLS changes needed — existing cp_upd_own / cp_sel_own / cp_pub policies
  cover all columns on creator_profiles uniformly.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'creator_profiles'
      AND column_name  = 'categories'
  ) THEN
    ALTER TABLE public.creator_profiles
      ADD COLUMN categories text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'creator_profiles'
      AND column_name  = 'personality_traits'
  ) THEN
    ALTER TABLE public.creator_profiles
      ADD COLUMN personality_traits text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'creator_profiles'
      AND column_name  = 'services_offered'
  ) THEN
    ALTER TABLE public.creator_profiles
      ADD COLUMN services_offered text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;
