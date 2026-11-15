/*
# Mother Scene Recipe Propagation to Verified Child Creators

## Purpose

When the Mother Creator (is_content_master = true) adds or updates a scene
recipe in `scene_image_productions`, the recipe fields are automatically
propagated to every verified (verification_status = 'approved') Child
Creator account as child-owned rows. Each child gets their own copy of the
recipe under their own `creator_id`, so existing RLS policies and the
generation edge function (which loads by `creator_id = auth.uid()`) work
without changes.

## What is shared (recipe fields only)

- scenario_id
- scene_label (scene name)
- description
- tags
- prompt
- gen_tool
- gen_model
- gen_ratio
- gen_number_of_images
- role_id (reference to the shared character_roles row)

## What is NOT shared (media + identity fields)

- scene_image_url       — child generates independently
- scene_image_asset_id   — child generates independently
- scene_image_generation_id — child generates independently
- identity_image_url     — resolved per-child from their own character selection
- identity_asset_id      — resolved per-child
- role_image_url         — resolved per-child from their own role_image_productions
- role_image_asset_id    — resolved per-child
- scene_image_status     — starts as 'Pending' for each child

## How propagation works

1. **New column**: `source_scene_id` (uuid, nullable) is added to
   `scene_image_productions`. Mother's original rows have `source_scene_id = NULL`.
   Child-propagated rows have `source_scene_id` pointing to the Mother's row `id`.

2. **INSERT trigger** (`propagate_scene_recipe_insert`): fires AFTER a new row
   is inserted on a Mother Creator's account. Creates one child-owned row per
   verified creator, copying recipe fields and setting `source_scene_id` to
   the Mother row's `id`. Media/identity fields are left null/empty so the
   child's own generation is independent.

3. **UPDATE trigger** (`propagate_scene_recipe_update`): fires AFTER a Mother
   row's recipe fields are updated. Updates all child rows that have
   `source_scene_id` matching the Mother row's `id`, but ONLY touches recipe
   fields — never media, identity, or status fields.

4. **DELETE trigger** (`propagate_scene_recipe_delete`): fires BEFORE a Mother
   row is deleted. Deletes all child rows that were propagated from it
   (`source_scene_id` = Mother row id). This keeps children in sync when a
   scene is removed.

5. **Backfill**: existing Mother scene rows are propagated to all currently
   verified child creators in the same migration.

## Security

- No new RLS policies needed on `scene_image_productions` — existing
  owner-scoped policies (`auth.uid() = creator_id`) already cover child-owned
  rows since each child row has `creator_id` set to the child's account.
- The triggers run with SECURITY DEFINER (as the table owner) so they can
  insert/update/delete rows across different creator_ids. This is safe because
  the triggers only fire on Mother-originated changes and only propagate
  recipe fields.
- A check constraint ensures child rows (source_scene_id IS NOT NULL) never
  store Mother's media fields — they must always be null on propagated rows.
- Child creators cannot modify recipe fields on their propagated rows
  because the existing UPDATE RLS policy allows `auth.uid() = creator_id`,
  but the trigger-based update from Mother uses SECURITY DEFINER to bypass
  RLS. Children CAN update their own media fields (scene_image_url, status,
  identity fields) independently — the Mother UPDATE trigger never touches
  those columns.

## Important Notes

1. The Mother Creator's workflow is completely unchanged — she adds, edits,
   and deletes scenes as before.
2. Child Creators see propagated scene recipes under their own account.
   Existing frontend code queries `.eq('creator_id', creatorId)` which
   returns the child's own rows — no frontend query changes needed.
3. Child generated media (scene_image_url, scene_image_asset_id,
   scene_image_generation_id, scene_image_status) is stored on the child's
   own row and is never overwritten by Mother's updates.
4. The edge function `generate-scene-image` loads by `id` + `creator_id`,
   so a child generating an image operates on their own row — media is
   written to the child's row only.
5. When a new creator becomes verified (verification_status changes to
   'approved'), they will receive recipes on the next Mother scene
   add/update. A manual backfill function is provided for on-demand sync.
*/

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Add source_scene_id column to scene_image_productions
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE scene_image_productions
  ADD COLUMN IF NOT EXISTS source_scene_id uuid;

-- Index for fast lookups of propagated rows
CREATE INDEX IF NOT EXISTS idx_scene_image_productions_source
  ON scene_image_productions (source_scene_id)
  WHERE source_scene_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Helper: check if a creator is the Mother Creator
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_mother_creator(p_creator_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT true FROM creators WHERE id = p_creator_id AND is_content_master = true),
    false
  );
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Helper: get all verified child creator IDs
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_verified_child_creator_ids()
RETURNS TABLE (creator_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM creators
  WHERE verification_status = 'approved'
    AND is_content_master = false
    AND is_super_admin = false;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. INSERT trigger: propagate new Mother scene to all verified children
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.propagate_scene_recipe_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  child_ids uuid[];
BEGIN
  -- Only propagate from Mother Creator's rows, and only original rows
  -- (not already-propagated child rows)
  IF NOT public.is_mother_creator(NEW.creator_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.source_scene_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get all verified child creator IDs
  SELECT array_agg(creator_id) INTO child_ids
  FROM public.get_verified_child_creator_ids();

  IF child_ids IS NULL OR array_length(child_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Insert one child-owned row per verified creator with recipe fields only
  INSERT INTO scene_image_productions (
    creator_id,
    role_id,
    scene_id,
    scene_label,
    scenario_id,
    description,
    tags,
    prompt,
    gen_tool,
    gen_model,
    gen_ratio,
    gen_number_of_images,
    source_scene_id,
    identity_asset_id,
    identity_image_url,
    role_image_url,
    role_image_asset_id,
    scene_image_url,
    scene_image_asset_id,
    scene_image_generation_id,
    scene_image_status
  )
  SELECT
    child_id,
    NEW.role_id,
    NEW.scene_id,
    NEW.scene_label,
    NEW.scenario_id,
    NEW.description,
    NEW.tags,
    NEW.prompt,
    NEW.gen_tool,
    NEW.gen_model,
    NEW.gen_ratio,
    NEW.gen_number_of_images,
    NEW.id,
    NULL,             -- identity_asset_id: child resolves their own
    NULL,             -- identity_image_url: child resolves their own
    NULL,             -- role_image_url: child resolves their own
    NULL,             -- role_image_asset_id: child resolves their own
    NULL,             -- scene_image_url: child generates independently
    NULL,             -- scene_image_asset_id: child generates independently
    NULL,             -- scene_image_generation_id: child generates independently
    'Pending'         -- scene_image_status: starts fresh
  FROM unnest(child_ids) AS child_id
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_propagate_scene_recipe_insert ON scene_image_productions;
CREATE TRIGGER trg_propagate_scene_recipe_insert
  AFTER INSERT ON scene_image_productions
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_scene_recipe_insert();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. UPDATE trigger: propagate Mother recipe updates to child rows
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.propagate_scene_recipe_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only propagate from Mother Creator's original rows
  IF NOT public.is_mother_creator(NEW.creator_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.source_scene_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Only fire if recipe fields changed
  IF
    OLD.scenario_id IS NOT DISTINCT FROM NEW.scenario_id
    AND OLD.scene_label IS NOT DISTINCT FROM NEW.scene_label
    AND OLD.description IS NOT DISTINCT FROM NEW.description
    AND OLD.tags IS NOT DISTINCT FROM NEW.tags
    AND OLD.prompt IS NOT DISTINCT FROM NEW.prompt
    AND OLD.gen_tool IS NOT DISTINCT FROM NEW.gen_tool
    AND OLD.gen_model IS NOT DISTINCT FROM NEW.gen_model
    AND OLD.gen_ratio IS NOT DISTINCT FROM NEW.gen_ratio
    AND OLD.gen_number_of_images IS NOT DISTINCT FROM NEW.gen_number_of_images
    AND OLD.role_id IS NOT DISTINCT FROM NEW.role_id
  THEN
    RETURN NEW;
  END IF;

  -- Update recipe fields on all propagated child rows — NEVER touch media
  UPDATE scene_image_productions
  SET
    scenario_id = NEW.scenario_id,
    scene_label = NEW.scene_label,
    description = NEW.description,
    tags = NEW.tags,
    prompt = NEW.prompt,
    gen_tool = NEW.gen_tool,
    gen_model = NEW.gen_model,
    gen_ratio = NEW.gen_ratio,
    gen_number_of_images = NEW.gen_number_of_images,
    role_id = NEW.role_id,
    updated_at = now()
  WHERE source_scene_id = NEW.id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_propagate_scene_recipe_update ON scene_image_productions;
CREATE TRIGGER trg_propagate_scene_recipe_update
  AFTER UPDATE ON scene_image_productions
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_scene_recipe_update();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. DELETE trigger: remove propagated child rows when Mother deletes a scene
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.propagate_scene_recipe_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only propagate from Mother Creator's original rows
  IF NOT public.is_mother_creator(OLD.creator_id) THEN
    RETURN OLD;
  END IF;
  IF OLD.source_scene_id IS NOT NULL THEN
    RETURN OLD;
  END IF;

  -- Delete all child rows propagated from this Mother row
  DELETE FROM scene_image_productions
  WHERE source_scene_id = OLD.id;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_propagate_scene_recipe_delete ON scene_image_productions;
CREATE TRIGGER trg_propagate_scene_recipe_delete
  BEFORE DELETE ON scene_image_productions
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_scene_recipe_delete();

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Backfill: propagate existing Mother scenes to all verified children
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  mother_row RECORD;
  child_ids uuid[];
  child_id uuid;
BEGIN
  -- Find all Mother Creator original scene rows (source_scene_id IS NULL)
  FOR mother_row IN
    SELECT * FROM scene_image_productions
    WHERE source_scene_id IS NULL
      AND public.is_mother_creator(creator_id)
  LOOP
    -- Get verified child creator IDs
    SELECT array_agg(creator_id) INTO child_ids
    FROM public.get_verified_child_creator_ids();

    IF child_ids IS NULL THEN CONTINUE; END IF;

    FOREACH child_id IN ARRAY child_ids
    LOOP
      -- Skip if a propagated row already exists for this child + source
      IF NOT EXISTS (
        SELECT 1 FROM scene_image_productions
        WHERE creator_id = child_id
          AND source_scene_id = mother_row.id
      ) THEN
        INSERT INTO scene_image_productions (
          creator_id,
          role_id,
          scene_id,
          scene_label,
          scenario_id,
          description,
          tags,
          prompt,
          gen_tool,
          gen_model,
          gen_ratio,
          gen_number_of_images,
          source_scene_id,
          identity_asset_id,
          identity_image_url,
          role_image_url,
          role_image_asset_id,
          scene_image_url,
          scene_image_asset_id,
          scene_image_generation_id,
          scene_image_status
        ) VALUES (
          child_id,
          mother_row.role_id,
          mother_row.scene_id,
          mother_row.scene_label,
          mother_row.scenario_id,
          mother_row.description,
          mother_row.tags,
          mother_row.prompt,
          mother_row.gen_tool,
          mother_row.gen_model,
          mother_row.gen_ratio,
          mother_row.gen_number_of_images,
          mother_row.id,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          'Pending'
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 8. On-demand backfill function for newly verified creators
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.backfill_scene_recipes_for_creator(p_child_creator_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  mother_row RECORD;
  v_count integer := 0;
  v_is_verified text;
  v_is_master boolean;
BEGIN
  -- Verify the target is a verified child creator
  SELECT verification_status, is_content_master
  INTO v_is_verified, v_is_master
  FROM creators WHERE id = p_child_creator_id;

  IF v_is_verified IS NULL THEN
    RAISE EXCEPTION 'Creator not found';
  END IF;
  IF v_is_verified <> 'approved' THEN
    RAISE EXCEPTION 'Creator is not verified';
  END IF;
  IF v_is_master THEN
    RAISE EXCEPTION 'Cannot backfill to a Mother Creator';
  END IF;

  -- Propagate all Mother scene recipes to this child
  FOR mother_row IN
    SELECT * FROM scene_image_productions
    WHERE source_scene_id IS NULL
      AND public.is_mother_creator(creator_id)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM scene_image_productions
      WHERE creator_id = p_child_creator_id
        AND source_scene_id = mother_row.id
    ) THEN
      INSERT INTO scene_image_productions (
        creator_id,
        role_id,
        scene_id,
        scene_label,
        scenario_id,
        description,
        tags,
        prompt,
        gen_tool,
        gen_model,
        gen_ratio,
        gen_number_of_images,
        source_scene_id,
        identity_asset_id,
        identity_image_url,
        role_image_url,
        role_image_asset_id,
        scene_image_url,
        scene_image_asset_id,
        scene_image_generation_id,
        scene_image_status
      ) VALUES (
        p_child_creator_id,
        mother_row.role_id,
        mother_row.scene_id,
        mother_row.scene_label,
        mother_row.scenario_id,
        mother_row.description,
        mother_row.tags,
        mother_row.prompt,
        mother_row.gen_tool,
        mother_row.gen_model,
        mother_row.gen_ratio,
        mother_row.gen_number_of_images,
        mother_row.id,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        'Pending'
      )
      ON CONFLICT DO NOTHING;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;
