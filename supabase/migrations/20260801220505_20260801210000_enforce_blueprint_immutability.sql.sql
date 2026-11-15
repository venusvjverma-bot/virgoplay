/*
# Enforce Blueprint Immutability for Published Versions

## Purpose

Blueprint Packages must be reproducible. If a Blueprint Component changes,
existing Blueprint Packages must not silently change. This migration adds
database-level enforcement so that:

1. Published Blueprint Components cannot have their content fields modified
   in place. Only status transitions (e.g. archived) and non-content fields
   (updated_at) are allowed.
2. Published Blueprint Packages cannot have their content fields modified
   in place. Same rules apply.
3. The `blueprint_package_components` join table is locked once the parent
   package is published — no inserts, updates, or deletes on references
   belonging to a published package.

## How It Works

### trigger_guard_published_component (BEFORE UPDATE on blueprint_components)

Intercepts every UPDATE. If the existing row has `status = 'published'`,
the trigger checks every content column (name, code, description, metadata,
component_type_id, version, version_root_id, parent_component_id,
published_at). If any of these differ from the old value, the UPDATE is
rejected with an error. Only `status` and `updated_at` may change.

### trigger_guard_published_package (BEFORE UPDATE on blueprint_packages)

Same logic for blueprint_packages. Content columns: name, code, description,
metadata, version, version_root_id, parent_package_id, published_at.

### Lock join table for published packages

Three triggers on `blueprint_package_components` (BEFORE INSERT/UPDATE/DELETE)
check whether the parent package has `status = 'published'`. If so, the
operation is rejected. This prevents adding, removing, or reordering
components on a published package.

## Important Notes

1. To edit a published component or package, the user must create a new
   version (INSERT a new row with incremented version + parent pointers).
   The old version remains untouched.
2. Archiving a published component/package is still allowed — only `status`
   changes, not content.
3. These are DEFERRABLE CONSTRAINT-AWARE triggers — they run BEFORE the
   update, comparing OLD vs NEW row values.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Guard published components from content changes
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION guard_published_component_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' THEN
    IF NEW.name                IS DISTINCT FROM OLD.name
    OR NEW.code                IS DISTINCT FROM OLD.code
    OR NEW.description         IS DISTINCT FROM OLD.description
    OR NEW.metadata            IS DISTINCT FROM OLD.metadata
    OR NEW.component_type_id   IS DISTINCT FROM OLD.component_type_id
    OR NEW.version             IS DISTINCT FROM OLD.version
    OR NEW.version_root_id     IS DISTINCT FROM OLD.version_root_id
    OR NEW.parent_component_id IS DISTINCT FROM OLD.parent_component_id
    OR NEW.published_at        IS DISTINCT FROM OLD.published_at
    THEN
      RAISE EXCEPTION 'Cannot modify content of a published Blueprint Component (id=%). Create a new version instead.', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_published_component ON blueprint_components;
CREATE TRIGGER guard_published_component
  BEFORE UPDATE ON blueprint_components
  FOR EACH ROW EXECUTE FUNCTION guard_published_component_update();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Guard published packages from content changes
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION guard_published_package_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' THEN
    IF NEW.name              IS DISTINCT FROM OLD.name
    OR NEW.code              IS DISTINCT FROM OLD.code
    OR NEW.description      IS DISTINCT FROM OLD.description
    OR NEW.metadata          IS DISTINCT FROM OLD.metadata
    OR NEW.version           IS DISTINCT FROM OLD.version
    OR NEW.version_root_id   IS DISTINCT FROM OLD.version_root_id
    OR NEW.parent_package_id IS DISTINCT FROM OLD.parent_package_id
    OR NEW.published_at      IS DISTINCT FROM OLD.published_at
    THEN
      RAISE EXCEPTION 'Cannot modify content of a published Blueprint Package (id=%). Create a new version instead.', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_published_package ON blueprint_packages;
CREATE TRIGGER guard_published_package
  BEFORE UPDATE ON blueprint_packages
  FOR EACH ROW EXECUTE FUNCTION guard_published_package_update();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Lock join table for published packages
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION guard_published_package_refs_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  pkg_status text;
BEGIN
  SELECT status INTO pkg_status FROM blueprint_packages WHERE id = NEW.package_id;
  IF pkg_status = 'published' THEN
    RAISE EXCEPTION 'Cannot add components to a published Blueprint Package (id=%). Create a new version instead.', NEW.package_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION guard_published_package_refs_update()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  pkg_status text;
BEGIN
  SELECT status INTO pkg_status FROM blueprint_packages WHERE id = NEW.package_id;
  IF pkg_status = 'published' THEN
    RAISE EXCEPTION 'Cannot modify components of a published Blueprint Package (id=%). Create a new version instead.', NEW.package_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION guard_published_package_refs_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  pkg_status text;
BEGIN
  SELECT status INTO pkg_status FROM blueprint_packages WHERE id = OLD.package_id;
  IF pkg_status = 'published' THEN
    RAISE EXCEPTION 'Cannot remove components from a published Blueprint Package (id=%). Create a new version instead.', OLD.package_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_published_refs_insert ON blueprint_package_components;
CREATE TRIGGER guard_published_refs_insert
  BEFORE INSERT ON blueprint_package_components
  FOR EACH ROW EXECUTE FUNCTION guard_published_package_refs_insert();

DROP TRIGGER IF EXISTS guard_published_refs_update ON blueprint_package_components;
CREATE TRIGGER guard_published_refs_update
  BEFORE UPDATE ON blueprint_package_components
  FOR EACH ROW EXECUTE FUNCTION guard_published_package_refs_update();

DROP TRIGGER IF EXISTS guard_published_refs_delete ON blueprint_package_components;
CREATE TRIGGER guard_published_refs_delete
  BEFORE DELETE ON blueprint_package_components
  FOR EACH ROW EXECUTE FUNCTION guard_published_package_refs_delete();
