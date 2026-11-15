/*
# Add child_creator_mode column to character_studio_v2_settings

1. Purpose
   - Persists each creator's Child Creator toggle (ON/OFF) so it survives
     page refreshes and screen navigation.
   - Default is `true` (ON), matching the existing default-ON behavior at login.
   - A new login session still starts ON because no row exists yet for a
     brand-new creator, and the read helper returns `true` when no row is found.

2. Schema changes
   - `character_studio_v2_settings.child_creator_mode` (boolean, NOT NULL, DEFAULT true)

3. Security
   - No new tables. RLS is already enabled on `character_studio_v2_settings`
     with existing per-creator policies. The new column inherits the same
     row-level access control automatically — no policy changes needed.
*/

ALTER TABLE character_studio_v2_settings
  ADD COLUMN IF NOT EXISTS child_creator_mode boolean NOT NULL DEFAULT true;
