/*
# Beginning Stage — Sequential Progression Wiring

## Summary
Wires the MT Beginning stage (MT-BEG-001 through MT-BEG-009) so that all
three client replies on each dialogue package always advance to the next
sequential package, regardless of which reply the user selects.

This is intentional design for the Beginning stage: client replies are
conversation choices only, not branching decisions. The stage is used to
validate the conversation engine, dialogue sequencing, image progression,
and package loading without routing instability.

## Changes

### dialogue_package_responses — next_package_code updates
All three responses (sort_order 1, 2, 3) for each package are set to the
same next_package_code, creating strict sequential progression:

  MT-BEG-001 (all 3 replies) → MT-BEG-002
  MT-BEG-002 (all 3 replies) → MT-BEG-003
  MT-BEG-003 (all 3 replies) → MT-BEG-004
  MT-BEG-004 (all 3 replies) → MT-BEG-005
  MT-BEG-005 (all 3 replies) → MT-BEG-006
  MT-BEG-006 (all 3 replies) → MT-BEG-007
  MT-BEG-007 (all 3 replies) → MT-BEG-008
  MT-BEG-008 (all 3 replies) → MT-BEG-009
  MT-BEG-009 (all 3 replies) → MT-MID-001  ← stage transition

## Architecture Notes
1. The engine reads next_package_code from dialogue_package_responses at runtime.
   No engine code changes are required — only this data update.
2. The stage transition (BEG → MID) is detected automatically by the engine
   via extractStage(): "MT-BEG-009" → "BEG" vs "MT-MID-001" → "MID".
3. This pattern applies ONLY to the Beginning stage. Middle and Ending stages
   will use true branching (different replies → different next_package_codes)
   when authored. The engine already supports this — no architecture changes needed.
4. MT-MID-001 already exists in dialogue_packages with a placeholder dialogue
   and is ready to receive incoming transitions from BEG-009.
*/

UPDATE dialogue_package_responses
SET next_package_code = 'MT-BEG-002'
WHERE package_code = 'MT-BEG-001';

UPDATE dialogue_package_responses
SET next_package_code = 'MT-BEG-003'
WHERE package_code = 'MT-BEG-002';

UPDATE dialogue_package_responses
SET next_package_code = 'MT-BEG-004'
WHERE package_code = 'MT-BEG-003';

UPDATE dialogue_package_responses
SET next_package_code = 'MT-BEG-005'
WHERE package_code = 'MT-BEG-004';

UPDATE dialogue_package_responses
SET next_package_code = 'MT-BEG-006'
WHERE package_code = 'MT-BEG-005';

UPDATE dialogue_package_responses
SET next_package_code = 'MT-BEG-007'
WHERE package_code = 'MT-BEG-006';

UPDATE dialogue_package_responses
SET next_package_code = 'MT-BEG-008'
WHERE package_code = 'MT-BEG-007';

UPDATE dialogue_package_responses
SET next_package_code = 'MT-BEG-009'
WHERE package_code = 'MT-BEG-008';

UPDATE dialogue_package_responses
SET next_package_code = 'MT-MID-001'
WHERE package_code = 'MT-BEG-009';
