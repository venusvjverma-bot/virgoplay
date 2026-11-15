-- Extend package_type check constraint to allow 'image' and future media types.
ALTER TABLE engine_package_registry
  DROP CONSTRAINT IF EXISTS engine_package_registry_package_type_check;

ALTER TABLE engine_package_registry
  ADD CONSTRAINT engine_package_registry_package_type_check
  CHECK (package_type = ANY (ARRAY['role'::text, 'stage'::text, 'modifier'::text, 'image'::text, 'video'::text, 'scenario'::text]));
