/*
# Role Studio Step 1 — Share Mother Creator's roles to verified Child Creators

## Purpose

Share the Mother Creator's (test.test@gmail.com) Role Studio content with all
verified Child Creators as read-only, while keeping per-account role selection
and per-account generated role images completely separate.

## Changes

### 1. RLS: character_roles — add SELECT for verified Child Creators

The existing `select_own_roles` policy only allows `auth.uid() = creator_id`.
A new policy `select_master_roles_for_verified` allows verified creators
(verification_status = 'approved') to read roles whose creator is the content
master (is_content_master = true). This mirrors the existing
`csv2_select_master_for_verified` policy on character_studio_v2.

INSERT / UPDATE / DELETE policies remain owner-only — Child Creators cannot
modify the shared role rows.

### 2. New Table: character_role_selections

Per-account role selection — one row per creator, pointing to a shared
character_roles row. Mirrors character_studio_v2_selections.

Columns:
- creator_id (uuid, PK, references creators)
- role_id (uuid, nullable, references character_roles)
- updated_at (timestamptz)

### 3. New Table: role_image_productions

Per-account generated role images — one row per (creator_id, role_id).
Stores the Child Creator's own generated image, separate from the Mother's
role_image_url on the shared character_roles row.

Columns:
- id (uuid, PK)
- creator_id (uuid, NOT NULL, references creators)
- role_id (uuid, NOT NULL, references character_roles)
- role_image_url (text, nullable)
- role_image_path (text, nullable)
- role_image_asset_id (text, nullable)
- role_image_status (text, NOT NULL, default 'Pending')
- role_image_generation_id (uuid, nullable)
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

Unique constraint on (creator_id, role_id) — one production row per
creator per role.

## Security

- character_role_selections: RLS enabled, owner-scoped CRUD (auth.uid() = creator_id).
- role_image_productions: RLS enabled, owner-scoped CRUD (auth.uid() = creator_id).
- character_roles: new SELECT policy for verified children; write policies unchanged.

## Important Notes

1. The Mother Creator's existing workflow is unchanged — she still edits
   role_prompt and gen config directly on character_roles, and her generated
   images remain on character_roles.role_image_url.
2. Child Creators read role_prompt, gen_model, gen_ratio, gen_number_of_images
   from the shared character_roles row (read-only).
3. Child Creators' generated images go to role_image_productions, never to
   character_roles — Mother's data is never overwritten.
4. Role selection is per-account via character_role_selections — selecting a
   role does not affect any other creator.
*/
-- ───────────────────────────────────────────────────────────────────────────
-- 1. character_roles: add SELECT policy for verified Child Creators
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "select_master_roles_for_verified" ON character_roles;

CREATE POLICY "select_master_roles_for_verified"
ON character_roles FOR SELECT
TO authenticated
USING (
  (
    EXISTS (
      SELECT 1 FROM creators c
      WHERE c.id = character_roles.creator_id
        AND c.is_content_master = true
    )
  )
  AND
  (
    EXISTS (
      SELECT 1 FROM creators me
      WHERE me.id = auth.uid()
        AND me.verification_status = 'approved'
    )
  )
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. character_role_selections — per-account role selection
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS character_role_selections (
  creator_id uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  role_id uuid REFERENCES character_roles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (creator_id)
);

ALTER TABLE character_role_selections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_role_selection" ON character_role_selections;
CREATE POLICY "select_own_role_selection" ON character_role_selections
  FOR SELECT TO authenticated USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "upsert_own_role_selection" ON character_role_selections;
CREATE POLICY "upsert_own_role_selection" ON character_role_selections
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "update_own_role_selection" ON character_role_selections;
CREATE POLICY "update_own_role_selection" ON character_role_selections
  FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "delete_own_role_selection" ON character_role_selections;
CREATE POLICY "delete_own_role_selection" ON character_role_selections
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. role_image_productions — per-account generated role images
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS role_image_productions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES character_roles(id) ON DELETE CASCADE,
  role_image_url text,
  role_image_path text,
  role_image_asset_id text,
  role_image_status text NOT NULL DEFAULT 'Pending',
  role_image_generation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One production row per creator per role
CREATE UNIQUE INDEX IF NOT EXISTS role_image_productions_creator_role_uniq
  ON role_image_productions (creator_id, role_id);

ALTER TABLE role_image_productions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_role_image_productions" ON role_image_productions;
CREATE POLICY "select_own_role_image_productions" ON role_image_productions
  FOR SELECT TO authenticated USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "insert_own_role_image_productions" ON role_image_productions;
CREATE POLICY "insert_own_role_image_productions" ON role_image_productions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "update_own_role_image_productions" ON role_image_productions;
CREATE POLICY "update_own_role_image_productions" ON role_image_productions
  FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "delete_own_role_image_productions" ON role_image_productions;
CREATE POLICY "delete_own_role_image_productions" ON role_image_productions
  FOR DELETE TO authenticated USING (auth.uid() = creator_id);
