/*
# Per-Creator Character Selection for Character Studio V2

## Purpose
Character data (name, bio, identity image, status) is shared from the
Mother Creator to all verified Child Creators. However, the "selected
character" state must be independent per account — each creator has their
own pointer to which shared character they are currently viewing.

Previously, `is_selected` lived on the shared `character_studio_v2` row,
so when any account selected a character, it changed the selection for
every other account reading that same row.

## Changes

### 1. New table: `character_studio_v2_selections`
- One row per creator account (PK on `creator_id`).
- `creator_id` — which account this selection belongs to (FK to creators).
- `character_id` — which shared character they have selected (FK to
  character_studio_v2).
- `updated_at` — timestamp of last selection change.
- This table stores ONLY the selection pointer, not character data.

### 2. RLS on `character_studio_v2_selections`
- Each authenticated creator can SELECT, INSERT, UPDATE only their own
  row (`creator_id = auth.uid()`).
- No DELETE policy needed — selection is upserted, never deleted.

### 3. Updated `set_selected_character_v2` RPC
- Instead of writing `is_selected` on the shared character row, the RPC
  now upserts into `character_studio_v2_selections` for the calling
  creator.
- The shared `character_studio_v2` row is never modified.
- Authorization checks remain: caller must own the target character OR
  be a verified creator selecting a Mother Creator character.
- SECURITY DEFINER is still needed because the RPC verifies the target
  character's owner via a SELECT that may cross RLS boundaries.

### 4. Backfill
- For the Mother Creator, copy their current `is_selected = true`
  character into the new selections table so their existing selection
  is preserved.
*/

-- ── 1. Create per-creator selection table ──

CREATE TABLE IF NOT EXISTS character_studio_v2_selections (
  creator_id   uuid PRIMARY KEY REFERENCES creators(id) ON DELETE CASCADE,
  character_id uuid REFERENCES character_studio_v2(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE character_studio_v2_selections ENABLE ROW LEVEL SECURITY;

-- Each creator can read their own selection
DROP POLICY IF EXISTS "csv2_sel_select_own" ON character_studio_v2_selections;
CREATE POLICY "csv2_sel_select_own"
ON character_studio_v2_selections FOR SELECT
TO authenticated
USING (creator_id = auth.uid());

-- Each creator can insert their own selection row
DROP POLICY IF EXISTS "csv2_sel_insert_own" ON character_studio_v2_selections;
CREATE POLICY "csv2_sel_insert_own"
ON character_studio_v2_selections FOR INSERT
TO authenticated
WITH CHECK (creator_id = auth.uid());

-- Each creator can update their own selection row
DROP POLICY IF EXISTS "csv2_sel_update_own" ON character_studio_v2_selections;
CREATE POLICY "csv2_sel_update_own"
ON character_studio_v2_selections FOR UPDATE
TO authenticated
USING (creator_id = auth.uid())
WITH CHECK (creator_id = auth.uid());

-- ── 2. Update set_selected_character_v2 RPC ──

CREATE OR REPLACE FUNCTION public.set_selected_character_v2(p_character_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_creator_id   uuid;
  v_status       text;
  v_is_master    boolean;
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

  -- Upsert the per-creator selection pointer.
  -- The shared character_studio_v2 row is never modified.
  INSERT INTO character_studio_v2_selections (creator_id, character_id, updated_at)
  VALUES (auth.uid(), p_character_id, now())
  ON CONFLICT (creator_id)
  DO UPDATE SET character_id = EXCLUDED.character_id, updated_at = now();
END;
$function$;

-- ── 3. Backfill Mother Creator's existing selection ──

INSERT INTO character_studio_v2_selections (creator_id, character_id, updated_at)
SELECT creator_id, id, now()
FROM character_studio_v2
WHERE is_selected = true
ON CONFLICT (creator_id) DO NOTHING;