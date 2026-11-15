-- Extend scene recipe propagation to include video workflow configuration fields.
-- These are workflow-level settings only (prompt, model, duration, resolution, etc).
-- They do NOT include video_url, video_asset_id, video_generation_id, or video_status
-- — those are media fields the child generates independently.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Update INSERT trigger to include video config fields
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
  IF NOT public.is_mother_creator(NEW.creator_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.source_scene_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(creator_id) INTO child_ids
  FROM public.get_verified_child_creator_ids();

  IF child_ids IS NULL OR array_length(child_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

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
    scene_image_status,
    video_prompt,
    video_model,
    video_duration,
    video_resolution,
    video_generate_audio,
    video_camera_fixed,
    video_prompt_extend,
    video_negative_prompt,
    video_ref_asset_id,
    video_last_frame_asset_id
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
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'Pending',
    NEW.video_prompt,
    NEW.video_model,
    NEW.video_duration,
    NEW.video_resolution,
    NEW.video_generate_audio,
    NEW.video_camera_fixed,
    NEW.video_prompt_extend,
    NEW.video_negative_prompt,
    NEW.video_ref_asset_id,
    NEW.video_last_frame_asset_id
  FROM unnest(child_ids) AS child_id
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Update UPDATE trigger to include video config fields
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.propagate_scene_recipe_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_mother_creator(NEW.creator_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.source_scene_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Only fire if recipe or video config fields changed
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
    AND OLD.video_prompt IS NOT DISTINCT FROM NEW.video_prompt
    AND OLD.video_model IS NOT DISTINCT FROM NEW.video_model
    AND OLD.video_duration IS NOT DISTINCT FROM NEW.video_duration
    AND OLD.video_resolution IS NOT DISTINCT FROM NEW.video_resolution
    AND OLD.video_generate_audio IS NOT DISTINCT FROM NEW.video_generate_audio
    AND OLD.video_camera_fixed IS NOT DISTINCT FROM NEW.video_camera_fixed
    AND OLD.video_prompt_extend IS NOT DISTINCT FROM NEW.video_prompt_extend
    AND OLD.video_negative_prompt IS NOT DISTINCT FROM NEW.video_negative_prompt
    AND OLD.video_ref_asset_id IS NOT DISTINCT FROM NEW.video_ref_asset_id
    AND OLD.video_last_frame_asset_id IS NOT DISTINCT FROM NEW.video_last_frame_asset_id
  THEN
    RETURN NEW;
  END IF;

  -- Update recipe + video config fields on all propagated child rows
  -- NEVER touch media fields (scene_image_url, video_url, video_status, etc.)
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
    video_prompt = NEW.video_prompt,
    video_model = NEW.video_model,
    video_duration = NEW.video_duration,
    video_resolution = NEW.video_resolution,
    video_generate_audio = NEW.video_generate_audio,
    video_camera_fixed = NEW.video_camera_fixed,
    video_prompt_extend = NEW.video_prompt_extend,
    video_negative_prompt = NEW.video_negative_prompt,
    video_ref_asset_id = NEW.video_ref_asset_id,
    video_last_frame_asset_id = NEW.video_last_frame_asset_id,
    updated_at = now()
  WHERE source_scene_id = NEW.id;

  RETURN NEW;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Backfill: sync video config to existing propagated child rows
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  mother_row RECORD;
  child_ids uuid[];
  child_id uuid;
BEGIN
  FOR mother_row IN
    SELECT * FROM scene_image_productions
    WHERE source_scene_id IS NULL
      AND public.is_mother_creator(creator_id)
  LOOP
    -- Update existing propagated rows with video config
    UPDATE scene_image_productions
    SET
      video_prompt = mother_row.video_prompt,
      video_model = mother_row.video_model,
      video_duration = mother_row.video_duration,
      video_resolution = mother_row.video_resolution,
      video_generate_audio = mother_row.video_generate_audio,
      video_camera_fixed = mother_row.video_camera_fixed,
      video_prompt_extend = mother_row.video_prompt_extend,
      video_negative_prompt = mother_row.video_negative_prompt,
      video_ref_asset_id = mother_row.video_ref_asset_id,
      video_last_frame_asset_id = mother_row.video_last_frame_asset_id
    WHERE source_scene_id = mother_row.id;

    -- Also insert missing propagated rows (in case new children were verified)
    SELECT array_agg(creator_id) INTO child_ids
    FROM public.get_verified_child_creator_ids();

    IF child_ids IS NULL THEN CONTINUE; END IF;

    FOREACH child_id IN ARRAY child_ids
    LOOP
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
          scene_image_status,
          video_prompt,
          video_model,
          video_duration,
          video_resolution,
          video_generate_audio,
          video_camera_fixed,
          video_prompt_extend,
          video_negative_prompt,
          video_ref_asset_id,
          video_last_frame_asset_id
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
          NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Pending',
          mother_row.video_prompt,
          mother_row.video_model,
          mother_row.video_duration,
          mother_row.video_resolution,
          mother_row.video_generate_audio,
          mother_row.video_camera_fixed,
          mother_row.video_prompt_extend,
          mother_row.video_negative_prompt,
          mother_row.video_ref_asset_id,
          mother_row.video_last_frame_asset_id
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Update backfill function to include video config
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
        scene_image_status,
        video_prompt,
        video_model,
        video_duration,
        video_resolution,
        video_generate_audio,
        video_camera_fixed,
        video_prompt_extend,
        video_negative_prompt,
        video_ref_asset_id,
        video_last_frame_asset_id
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
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Pending',
        mother_row.video_prompt,
        mother_row.video_model,
        mother_row.video_duration,
        mother_row.video_resolution,
        mother_row.video_generate_audio,
        mother_row.video_camera_fixed,
        mother_row.video_prompt_extend,
        mother_row.video_negative_prompt,
        mother_row.video_ref_asset_id,
        mother_row.video_last_frame_asset_id
      )
      ON CONFLICT DO NOTHING;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;
