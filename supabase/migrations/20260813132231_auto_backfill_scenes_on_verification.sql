/*
# Auto-backfill scene recipes when a creator becomes verified

## Purpose

When an admin approves a creator (verification_status changes to
'approved'), automatically backfill all Mother Creator scene recipes
to that newly-verified child creator using the existing
`backfill_scene_recipes_for_creator` function.

This ensures new verified children receive shared scene recipes without
any manual step, keeping them in sync with the Mother's current scenes.

## How it works

An AFTER UPDATE trigger on `creators` detects when `verification_status`
transitions from a non-approved value to 'approved'. It then calls
`backfill_scene_recipes_for_creator` with the creator's ID, which inserts
one propagated row per Mother scene (skipping any that already exist).

The trigger is SECURITY DEFINER so it can read Mother's scene rows and
insert child-owned rows across different creator_ids. It is safe because:
- It only fires on verification_status → 'approved' transitions
- It only propagates recipe fields (no media)
- The backfill function validates the target is a verified non-master creator

## Edge cases

- Re-approval (rejected → approved): backfill skips rows that already exist
  via `ON CONFLICT DO NOTHING`, so previously-generated child media is preserved
- Approval of a Mother Creator: the backfill function raises an exception,
  which is caught in the trigger to avoid blocking the update
- Non-verification updates (e.g. profile edits): trigger exits early
*/
-- ───────────────────────────────────────────────────────────────────────────
-- AFTER UPDATE trigger: auto-backfill scene recipes on verification approval
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_backfill_scenes_on_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- Only fire when verification_status transitions TO 'approved'
  IF (OLD.verification_status IS DISTINCT FROM 'approved')
     AND (NEW.verification_status = 'approved')
     AND (NEW.is_content_master = false OR NEW.is_content_master IS NULL)
  THEN
    -- Backfill scene recipes; catch exceptions to never block the approval
    BEGIN
      v_count := public.backfill_scene_recipes_for_creator(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Silently ignore — e.g. no Mother scenes yet, or edge cases
      v_count := 0;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_backfill_scenes_on_verification ON creators;
CREATE TRIGGER trg_auto_backfill_scenes_on_verification
  AFTER UPDATE ON creators
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_backfill_scenes_on_verification();
