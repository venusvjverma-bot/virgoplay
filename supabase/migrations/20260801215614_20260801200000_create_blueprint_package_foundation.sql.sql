/*
# Blueprint Package Foundation V1

## Purpose

Creates the complete database architecture for Blueprint Packages — the permanent
source of creative data for future generations. Blueprint Packages define WHAT
should be generated; the Generation Engine defines HOW. This migration creates
only the creative-data layer. No prompt text, no generated media, no provider
integration, and no connection to the Generation Engine.

## Architecture Overview

Three layers:

1. **blueprint_component_types** — registry of the 12 component categories
   (identity, body, dress, accessory, role, environment, pose, expression,
   camera, lighting, quality, negative_prompt). Static enum-like table.

2. **blueprint_components** — reusable creative building blocks. Each belongs
   to a type and a creator. A component is a self-contained creative definition
   (e.g. "Café Environment", "Soft Cinematic Lighting"). Components are
   independently versioned and reusable across many packages.

3. **blueprint_packages** — an ordered collection of component references. A
   package references components (not their data), so updating a component
   automatically affects all packages that reference it. Packages are
   immutably versioned: editing a published package creates a new version row
   while the old version remains permanently available.

## New Tables

### blueprint_component_types
- `id` (uuid PK)
- `code` (text, unique) — machine code: identity, body, dress, etc.
- `label` (text) — human label: "Identity Blueprint", etc.
- `display_order` (int) — UI sort order
- `created_at` (timestamptz)

### blueprint_components
- `id` (uuid PK)
- `creator_id` (uuid FK → auth.users, NOT NULL DEFAULT auth.uid())
- `component_type_id` (uuid FK → blueprint_component_types)
- `name` (text) — user-facing name
- `code` (text) — machine code, unique per (creator_id, code)
- `description` (text, nullable) — what this component represents
- `metadata` (jsonb, default '{}') — provider-independent creative attributes
- `status` (text, default 'draft') — draft | published | archived
- `version` (int, default 1) — immutable version number
- `current_version_id` (uuid, nullable) — self-referential FK to the latest
  version of this component. NULL on the first version; set when v2+ exists.
  The row whose `current_version_id` IS NULL and `id = version_root_id` is the
  "head" version. (Simpler: the row with the highest `version` for a given
  `version_root_id` is the current version.)
- `version_root_id` (uuid, nullable) — FK to the original component (v1).
  NULL on the first version; set on all subsequent versions to point back to v1.
- `parent_component_id` (uuid, nullable) — FK to the previous version.
- `created_at`, `updated_at` (timestamptz)
- `published_at` (timestamptz, nullable)

### blueprint_packages
- `id` (uuid PK)
- `creator_id` (uuid FK → auth.users, NOT NULL DEFAULT auth.uid())
- `name` (text) — package name
- `code` (text) — machine code, unique per (creator_id, code)
- `description` (text, nullable)
- `metadata` (jsonb, default '{}') — package-level creative metadata
- `status` (text, default 'draft') — draft | published | archived
- `version` (int, default 1)
- `version_root_id` (uuid, nullable) — FK to v1 of this package
- `parent_package_id` (uuid, nullable) — FK to previous version
- `created_at`, `updated_at` (timestamptz)
- `published_at` (timestamptz, nullable)

### blueprint_package_components (join table)
- `id` (uuid PK)
- `package_id` (uuid FK → blueprint_packages ON DELETE CASCADE)
- `component_id` (uuid FK → blueprint_components)
- `component_type_id` (uuid FK → blueprint_component_types) — denormalized for fast queries
- `display_order` (int, default 0) — ordering within the package
- `metadata` (jsonb, default '{}') — per-reference overrides (e.g. weight, notes)
- `created_at` (timestamptz)

## Versioning Model

- The first version of a package/component has `version=1`, `version_root_id=NULL`,
  `parent_*_id=NULL`.
- When a published package is edited, a new row is inserted with `version=N+1`,
  `version_root_id` set to the original row's id, `parent_package_id` set to the
  previous version's id. The new row starts in `status='draft'`.
- When the new version is published, its `status` becomes 'published' and
  `published_at` is set. The previous version remains in the database with its
  original `status='published'` — it is NOT archived or modified.
- Future generations reference a specific package version by id, so existing
  generation snapshots are never affected by new versions.
- The "current" version of a package is the row with the highest `version` among
  rows sharing the same `version_root_id` (or the row itself if `version_root_id`
  is NULL and no other rows point to it as root).

## Security (RLS)

All tables use owner-scoped RLS (`auth.uid() = creator_id`). The
`blueprint_component_types` registry is read-only and accessible to all
authenticated users (it is reference data).

- blueprint_component_types: SELECT TO authenticated (read-only reference)
- blueprint_components: full CRUD, owner-scoped (auth.uid() = creator_id)
- blueprint_packages: full CRUD, owner-scoped
- blueprint_package_components: owner-scoped via EXISTS check on parent package

## Indexes

- blueprint_components(creator_id, status)
- blueprint_components(component_type_id)
- blueprint_components(version_root_id)
- blueprint_packages(creator_id, status)
- blueprint_packages(version_root_id)
- blueprint_package_components(package_id, display_order)
- blueprint_package_components(component_id)

## Important Notes

1. No prompt text columns — Blueprint Packages contain creative references, not
   rendered prompts. Prompt assembly is a future phase.
2. No provider columns — Blueprint Packages are provider-independent.
3. No generation engine columns — the Generation Engine is frozen and untouched.
4. `metadata` jsonb columns allow flexible, provider-independent creative
   attributes without schema changes.
5. The `blueprint_component_types` table is seeded with the 12 canonical types.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Component Types Registry
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blueprint_component_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,
  label         text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE blueprint_component_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_component_types" ON blueprint_component_types;
CREATE POLICY "read_component_types"
  ON blueprint_component_types FOR SELECT
  TO authenticated USING (true);

-- Seed the 12 canonical component types
INSERT INTO blueprint_component_types (code, label, display_order) VALUES
  ('identity',        'Identity Blueprint',       1),
  ('body',            'Body Blueprint',           2),
  ('dress',           'Dress Blueprint',           3),
  ('accessory',       'Accessory Blueprint',       4),
  ('role',            'Role Blueprint',            5),
  ('environment',     'Environment Blueprint',     6),
  ('pose',            'Pose Blueprint',            7),
  ('expression',      'Expression Blueprint',      8),
  ('camera',          'Camera Blueprint',          9),
  ('lighting',        'Lighting Blueprint',       10),
  ('quality',         'Quality Blueprint',        11),
  ('negative_prompt', 'Negative Prompt Blueprint', 12)
ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Blueprint Components (reusable creative building blocks)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blueprint_components (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id          uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  component_type_id   uuid NOT NULL REFERENCES blueprint_component_types(id),
  name                text NOT NULL,
  code                text NOT NULL,
  description         text,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version             int NOT NULL DEFAULT 1,
  version_root_id     uuid REFERENCES blueprint_components(id) ON DELETE SET NULL,
  parent_component_id uuid REFERENCES blueprint_components(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  published_at        timestamptz,
  UNIQUE (creator_id, code)
);

ALTER TABLE blueprint_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_components" ON blueprint_components;
CREATE POLICY "select_own_components"
  ON blueprint_components FOR SELECT
  TO authenticated USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "insert_own_components" ON blueprint_components;
CREATE POLICY "insert_own_components"
  ON blueprint_components FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "update_own_components" ON blueprint_components;
CREATE POLICY "update_own_components"
  ON blueprint_components FOR UPDATE
  TO authenticated USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "delete_own_components" ON blueprint_components;
CREATE POLICY "delete_own_components"
  ON blueprint_components FOR DELETE
  TO authenticated USING (auth.uid() = creator_id);

CREATE INDEX IF NOT EXISTS idx_bp_components_creator_status
  ON blueprint_components(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_bp_components_type
  ON blueprint_components(component_type_id);
CREATE INDEX IF NOT EXISTS idx_bp_components_version_root
  ON blueprint_components(version_root_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Blueprint Packages (ordered collection of component references)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blueprint_packages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id        uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  code              text NOT NULL,
  description       text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version           int NOT NULL DEFAULT 1,
  version_root_id   uuid REFERENCES blueprint_packages(id) ON DELETE SET NULL,
  parent_package_id uuid REFERENCES blueprint_packages(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  published_at      timestamptz,
  UNIQUE (creator_id, code)
);

ALTER TABLE blueprint_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_packages" ON blueprint_packages;
CREATE POLICY "select_own_packages"
  ON blueprint_packages FOR SELECT
  TO authenticated USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "insert_own_packages" ON blueprint_packages;
CREATE POLICY "insert_own_packages"
  ON blueprint_packages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "update_own_packages" ON blueprint_packages;
CREATE POLICY "update_own_packages"
  ON blueprint_packages FOR UPDATE
  TO authenticated USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "delete_own_packages" ON blueprint_packages;
CREATE POLICY "delete_own_packages"
  ON blueprint_packages FOR DELETE
  TO authenticated USING (auth.uid() = creator_id);

CREATE INDEX IF NOT EXISTS idx_bp_packages_creator_status
  ON blueprint_packages(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_bp_packages_version_root
  ON blueprint_packages(version_root_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Package-Component Join Table (references, not data duplication)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blueprint_package_components (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id        uuid NOT NULL REFERENCES blueprint_packages(id) ON DELETE CASCADE,
  component_id      uuid NOT NULL REFERENCES blueprint_components(id) ON DELETE RESTRICT,
  component_type_id uuid NOT NULL REFERENCES blueprint_component_types(id),
  display_order     int NOT NULL DEFAULT 0,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, component_id)
);

ALTER TABLE blueprint_package_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_package_components" ON blueprint_package_components;
CREATE POLICY "select_own_package_components"
  ON blueprint_package_components FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM blueprint_packages
      WHERE blueprint_packages.id = blueprint_package_components.package_id
        AND blueprint_packages.creator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_package_components" ON blueprint_package_components;
CREATE POLICY "insert_own_package_components"
  ON blueprint_package_components FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM blueprint_packages
      WHERE blueprint_packages.id = blueprint_package_components.package_id
        AND blueprint_packages.creator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_own_package_components" ON blueprint_package_components;
CREATE POLICY "update_own_package_components"
  ON blueprint_package_components FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM blueprint_packages
      WHERE blueprint_packages.id = blueprint_package_components.package_id
        AND blueprint_packages.creator_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM blueprint_packages
      WHERE blueprint_packages.id = blueprint_package_components.package_id
        AND blueprint_packages.creator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_own_package_components" ON blueprint_package_components;
CREATE POLICY "delete_own_package_components"
  ON blueprint_package_components FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM blueprint_packages
      WHERE blueprint_packages.id = blueprint_package_components.package_id
        AND blueprint_packages.creator_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_bp_pkg_components_package_order
  ON blueprint_package_components(package_id, display_order);
CREATE INDEX IF NOT EXISTS idx_bp_pkg_components_component
  ON blueprint_package_components(component_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. updated_at trigger
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_blueprint_components ON blueprint_components;
CREATE TRIGGER set_updated_at_blueprint_components
  BEFORE UPDATE ON blueprint_components
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_blueprint_packages ON blueprint_packages;
CREATE TRIGGER set_updated_at_blueprint_packages
  BEFORE UPDATE ON blueprint_packages
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
