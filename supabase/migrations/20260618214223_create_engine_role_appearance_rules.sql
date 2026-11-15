-- engine_role_appearance_rules
-- Stores allowed clothing and accessory options per role.
-- AP-001 reads these rules at runtime — zero hardcoded role logic in the UI.
-- Future roles (GF-001, DF-001, PE-001, RP-001) inherit by inserting rows here.

CREATE TABLE engine_role_appearance_rules (
  role_code            text        PRIMARY KEY REFERENCES engine_package_registry(code),
  allowed_clothing     text[]      NOT NULL DEFAULT '{}',
  allowed_accessories  text[]      NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE engine_role_appearance_rules IS
  'Role-specific allowed clothing and accessory tags for AP-001 appearance blueprints. '
  'AP-001 reads from this table — no role logic is hardcoded in the UI. '
  'Add a row per role; options not in the allowed list are shown disabled/faded.';

COMMENT ON COLUMN engine_role_appearance_rules.allowed_clothing    IS 'Clothing tags that are selectable for this role. Others shown faded.';
COMMENT ON COLUMN engine_role_appearance_rules.allowed_accessories IS 'Accessory tags that are selectable for this role. Others shown faded.';

ALTER TABLE engine_role_appearance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_role_appearance_rules" ON engine_role_appearance_rules
  FOR SELECT TO authenticated USING (true);

-- ── Seed: MT-001 rules ────────────────────────────────────────────────────────

INSERT INTO engine_role_appearance_rules (role_code, allowed_clothing, allowed_accessories)
VALUES (
  'MT-001',
  ARRAY['Massage Uniform', 'Spa Robe'],
  ARRAY['Earrings', 'Necklace', 'Watch']
);
