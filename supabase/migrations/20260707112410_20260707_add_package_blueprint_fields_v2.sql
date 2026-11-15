ALTER TABLE engine_package_registry
  ADD COLUMN IF NOT EXISTS scene               text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS current_relationship text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emotion             text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS word_count_range    text NOT NULL DEFAULT '';
