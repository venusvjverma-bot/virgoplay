-- engine_dialogue_records
-- Stores individual dialogue entries for conversation stage packages.
-- The Fetch Engine resolves the next record using (package_code, seq, path).
--
-- Resolution rule:
--   1. Look up (package_code, next_seq, next_path) from the chosen choice.
--   2. If not found, fall back to (package_code, next_seq, 'all').
--   3. If is_terminal = true, load the package identified by transition_to.

CREATE TABLE engine_dialogue_records (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  package_code    text        NOT NULL REFERENCES engine_package_registry(code),
  seq             integer     NOT NULL,
  path            text        NOT NULL DEFAULT 'all',
  speaker         text        NOT NULL DEFAULT 'companion'
                              CHECK (speaker IN ('companion', 'system')),
  message         text        NOT NULL,

  -- Array of user choice buttons.
  -- Each element: { "id": text, "label": text, "next_seq": int, "next_path": text }
  choices         jsonb       NOT NULL DEFAULT '[]',

  -- Defaults used when choices is empty (linear progression).
  next_seq        integer,
  next_path       text        NOT NULL DEFAULT 'all',

  -- Terminal record ends this package and hands off to the next.
  is_terminal     boolean     NOT NULL DEFAULT false,
  transition_to   text        REFERENCES engine_package_registry(code),

  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE engine_dialogue_records IS
  'Individual dialogue records for a conversation stage package. '
  'Fetched sequentially by (package_code, seq, path). '
  'path = ''all'' records apply across all conversation paths.';

COMMENT ON COLUMN engine_dialogue_records.choices IS
  'Array of {id, label, next_seq, next_path}. '
  'Empty array = linear record; advance using next_seq / next_path columns.';

COMMENT ON COLUMN engine_dialogue_records.is_terminal IS
  'When true this is the last record in the package. '
  'Fetch Engine loads transition_to package after display.';

-- Enforce uniqueness so the Fetch Engine always resolves exactly one record.
CREATE UNIQUE INDEX engine_dialogue_records_lookup
  ON engine_dialogue_records (package_code, seq, path)
  WHERE is_active = true;

CREATE INDEX engine_dialogue_records_package_seq
  ON engine_dialogue_records (package_code, seq);

ALTER TABLE engine_dialogue_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_dialogue_records" ON engine_dialogue_records
  FOR SELECT TO authenticated USING (true);
