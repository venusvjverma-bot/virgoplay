/*
# Add next_dialogue_code to dialogue_package_responses

## Summary
Extends the client-response routing model so each response targets a specific dialogue
variant (e.g. MT-BEG-003A) rather than a package code (e.g. MT-BEG-003).

## Changes

### Modified Tables
- `dialogue_package_responses`
  - NEW column: `next_dialogue_code text` — stores the fully-qualified dialogue variant code
    that the engine should navigate to when a client selects this response.
    Examples: MT-BEG-003A, MT-BEG-003B, MT-BEG-003C.
    NULL means the session terminates (same semantics as a NULL next_package_code).

### Backfill
For existing rows that already have a `next_package_code`:
  - If the target package has sequence >= 2 (a branching package), default to variant A
    (next_package_code || 'A') as the initial value. The content master can then refine
    individual responses to point to B or C.
  - If the target package has sequence < 2 (the opening package, no branching), copy the
    code as-is.

### Preserved
- `next_package_code` is kept intact for backward compatibility. No data is removed.

## Notes
1. The new column is nullable. NULL = terminal response (session ends).
2. Backfill uses a JOIN on dialogue_packages to identify target sequence.
3. Existing code using next_package_code continues to work until migrated.
*/

ALTER TABLE dialogue_package_responses
  ADD COLUMN IF NOT EXISTS next_dialogue_code text;

-- Backfill: map existing next_package_code → next_dialogue_code with variant suffix
UPDATE dialogue_package_responses r
SET next_dialogue_code =
  CASE
    WHEN dp.sequence >= 2 THEN r.next_package_code || 'A'
    ELSE r.next_package_code
  END
FROM dialogue_packages dp
WHERE r.next_package_code IS NOT NULL
  AND r.next_package_code = dp.package_code
  AND r.next_dialogue_code IS NULL;
