
-- Atomic "set as selected" function for character_studio_v2
-- Unsets is_selected on all the creator's other characters, then sets
-- is_selected = true on the target character, in a single transaction.
-- SECURITY DEFINER so it can update multiple rows despite RLS per-row checks.

CREATE OR REPLACE FUNCTION public.set_selected_character_v2(p_character_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id uuid;
  v_status text;
BEGIN
  -- Look up the target character and verify ownership + status
  SELECT creator_id, status
  INTO v_creator_id, v_status
  FROM character_studio_v2
  WHERE id = p_character_id;

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

  -- Verify the caller owns this character
  IF v_creator_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Only Active characters can be selected
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Only Active characters can be set as Selected';
  END IF;

  -- Unset is_selected on all the creator's other characters
  UPDATE character_studio_v2
  SET is_selected = false, updated_at = now()
  WHERE creator_id = v_creator_id
    AND id <> p_character_id
    AND is_selected = true;

  -- Set is_selected = true on the target
  UPDATE character_studio_v2
  SET is_selected = true, updated_at = now()
  WHERE id = p_character_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.set_selected_character_v2(uuid) TO authenticated;
