-- Fix scenario → package linkage to match correct architecture:
-- MT-SC-001 (First Visit) owns the BEGIN stage packages MT-BEG-001..009.
-- MT-SC-002..004 retain MT-MID-001 as a temporary placeholder.

-- Remove the placeholder MT-MID-001 link from MT-SC-001 only.
DELETE FROM engine_scenario_packages
WHERE scenario_code = 'MT-SC-001' AND package_code = 'MT-MID-001';

-- Link all nine BEGIN packages to MT-SC-001 in order.
INSERT INTO engine_scenario_packages (scenario_code, package_code, package_role, sort_order)
VALUES
  ('MT-SC-001', 'MT-BEG-001', 'main', 1),
  ('MT-SC-001', 'MT-BEG-002', 'main', 2),
  ('MT-SC-001', 'MT-BEG-003', 'main', 3),
  ('MT-SC-001', 'MT-BEG-004', 'main', 4),
  ('MT-SC-001', 'MT-BEG-005', 'main', 5),
  ('MT-SC-001', 'MT-BEG-006', 'main', 6),
  ('MT-SC-001', 'MT-BEG-007', 'main', 7),
  ('MT-SC-001', 'MT-BEG-008', 'main', 8),
  ('MT-SC-001', 'MT-BEG-009', 'main', 9)
ON CONFLICT (scenario_code, package_code) DO NOTHING;

COMMENT ON TABLE engine_scenario_packages IS
  'Links scenarios to the dialogue packages they own. '
  'MT-SC-001 owns MT-BEG-001..009 (nine sequential dialogue packages). '
  'package_role = main  → scenario-specific packages. '
  'package_role = final → shared endpoint packages (convergence). '
  'BEGIN packages (pre-scenario) are excluded from this table.';
