/*
# Shared Character Studio V2 — Read Access for Verified Child Creators

## Purpose
Allows verified (approved) Creator accounts to READ the Mother Creator's
Character Studio V2 data — characters and settings — so they see the same
shared master content. This is a one-way data flow: Mother Creator is the
source of truth, Child Creators are read-only consumers.

## Changes

### 1. character_studio_v2 — new SELECT policy
- Adds `csv2_select_master_for_verified` policy.
- Allows any authenticated creator whose `verification_status = 'approved'`
  to SELECT rows owned by the Mother Creator (identified by
  `is_content_master = true` on the creators table).
- The existing `csv2_select_own` policy remains unchanged — creators
  still read their own rows.
- No INSERT/UPDATE/DELETE policy changes — Child Creators cannot modify
  Mother Creator's data.

### 2. character_studio_v2_settings — new SELECT policy
- Adds `csv2_settings_select_master_for_verified` policy.
- Same logic: verified creators can read the Mother Creator's settings row.
- Existing `csv2_settings_select_own` remains unchanged.

### 3. set_selected_character_v2 RPC — updated
- Previously enforced `v_creator_id <> auth.uid()` check (only owner can select).
- Now allows two paths:
  a) Owner can select their own character (unchanged behavior).
  b) Verified creator can select a Mother Creator character.
- The RPC only sets `is_selected = true` on the master character row —
  it does NOT modify any other field on the master character.
- SECURITY DEFINER is required because the UPDATE on a master row
  owned by another user would fail RLS for the calling creator.

## Security
- Only SELECT access is granted to Child Creators.
- The RPC uses SECURITY DEFINER with a locked-down search_path.
- The RPC verifies the caller is a verified creator before allowing
  selection of a master character.
- Mother Creator's data is never modified except for the `is_selected`
  flag, which is a UI selection state, not content data.
*/

-- ── 1. character_studio_v2: allow verified creators to read master rows ──

DROP POLICY IF EXISTS "csv2_select_master_for_verified" ON character_studio_v2;

CREATE POLICY "csv2_select_master_for_verified"
ON character_studio_v2 FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM creators c
    WHERE c.id = character_studio_v2.creator_id
    AND c.is_content_master = true
  )
  AND EXISTS (
    SELECT 1 FROM creators me
    WHERE me.id = auth.uid()
    AND me.verification_status = 'approved'
  )
);

-- ── 2. character_studio_v2_settings: allow verified creators to read master settings ──

DROP POLICY IF EXISTS "csv2_settings_select_master_for_verified" ON character_studio_v2_settings;

CREATE POLICY "csv2_settings_select_master_for_verified"
ON character_studio_v2_settings FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM creators c
    WHERE c.id = character_studio_v2_settings.creator_id
    AND c.is_content_master = true
  )
  AND EXISTS (
    SELECT 1 FROM creators me
    WHERE me.id = auth.uid()
    AND me.verification_status = 'approved'
  )
);

-- ── 3. Update set_selected_character_v2 RPC ──

CREATE OR REPLACE FUNCTION public.set_selected_character_v2(p_character_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_creator_id uuid;
  v_status text;
  v_is_master boolean;
  v_caller_verified text;
BEGIN
  -- Look up the target character
  SELECT creator_id, status
  INTO v_creator_id, v_status
  FROM character_studio_v2
  WHERE id = p_character_id;

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

  -- Check if target character belongs to a Mother Creator
  SELECT COALESCE(
    (SELECT true FROM creators WHERE id = v_creator_id AND is_content_master = true),
    false
  ) INTO v_is_master;

  -- Get caller's verification status
  SELECT verification_status
  INTO v_caller_verified
  FROM creators
  WHERE id = auth.uid();

  IF v_is_master THEN
    -- Child Creator selecting a master character:
    -- must be verified (not the mother creator themselves — mother uses own path)
    IF v_creator_id = auth.uid() THEN
      -- Mother Creator selecting their own character — original path
      NULL;
    ELSIF v_caller_verified IS NULL OR v_caller_verified <> 'approved' THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  ELSE
    -- Non-master character: caller must own it
    IF v_creator_id <> auth.uid() THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;

  -- Only Active characters can be selected
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Only Active characters can be set as Selected';
  END IF;

  -- Unset is_selected on all the character owner's other characters
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
$function$;