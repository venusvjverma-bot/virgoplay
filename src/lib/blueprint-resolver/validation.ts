/**
 * Blueprint Resolver Foundation — Validation Layer
 *
 * Pure functions that validate loaded Blueprint data and produce a list of
 * validation issues. No side effects, no database access, no I/O.
 *
 * This makes the validation layer trivially unit-testable: pass in the loaded
 * data, get back issues. No mocking required.
 */

import type {
  BlueprintComponent,
  BlueprintComponentType,
  BlueprintPackage,
  BlueprintPackageComponent,
} from '../../types/blueprint';
import type {
  ValidationIssue,
  ValidationResult,
} from './types';
import type { ComponentTypeCode } from '../../types/blueprint';

// The 12 canonical component types in display order.
// A package is not required to have all 12, but this defines the set of
// *possible* required types. Currently none are strictly required — this
// list exists so the resolver can detect missing types if requirements change.
const ALL_TYPE_CODES: ComponentTypeCode[] = [
  'identity', 'body', 'dress', 'accessory', 'role',
  'environment', 'pose', 'expression', 'camera',
  'lighting', 'quality', 'negative_prompt',
];

/**
 * Validate the loaded package and its component references.
 *
 * Checks:
 * 1. Package is not archived (archived packages can still be resolved but
 *    produce a warning).
 * 2. Every join-table reference has a loadable component.
 * 3. Every component's type is present in the component_types map.
 * 4. No duplicate component types within the same package (warning, not error).
 * 5. No missing references (component_id on join row points to nothing).
 * 6. Package is not empty (warning if zero components).
 *
 * @returns A ValidationResult with all issues found.
 */
export function validatePackage(
  pkg: BlueprintPackage,
  refs: BlueprintPackageComponent[],
  components: Map<string, BlueprintComponent>,
  componentTypes: Map<string, BlueprintComponentType>,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // ── Package-level checks ────────────────────────────────────────────────

  if (pkg.status === 'archived') {
    issues.push({
      code: 'package_archived',
      message: `Package "${pkg.name}" is archived. Resolved output may be stale.`,
      severity: 'warning',
    });
  }

  if (refs.length === 0) {
    issues.push({
      code: 'empty_package',
      message: `Package "${pkg.name}" has no components attached.`,
      severity: 'warning',
    });
  }

  // ── Per-reference checks ────────────────────────────────────────────────

  const seenTypeCodes = new Map<ComponentTypeCode, number>();

  for (const ref of refs) {
    const component = components.get(ref.component_id);

    // Check 1: component exists
    if (!component) {
      issues.push({
        code: 'component_not_found',
        message: `Component ${ref.component_id} is referenced but was not found.`,
        severity: 'error',
        component_id: ref.component_id,
      });
      continue;
    }

    // Check 2: component type exists in the types map
    const type = componentTypes.get(component.component_type_id);
    if (!type) {
      issues.push({
        code: 'join_record_missing_type',
        message: `Component "${component.name}" has an unknown component type ${component.component_type_id}.`,
        severity: 'error',
        component_id: component.id,
      });
      continue;
    }

    // Check 3: component is not archived
    if (component.status === 'archived') {
      issues.push({
        code: 'component_archived',
        message: `Component "${component.name}" (${type.code}) is archived.`,
        severity: 'warning',
        component_id: component.id,
        component_type_code: type.code,
      });
    }

    // Check 4: component is published (draft components in a published package
    // is suspicious — warn but don't error, since draft packages can contain
    // draft components)
    if (component.status === 'draft' && pkg.status === 'published') {
      issues.push({
        code: 'component_not_published',
        message: `Component "${component.name}" (${type.code}) is still in draft status within a published package.`,
        severity: 'warning',
        component_id: component.id,
        component_type_code: type.code,
      });
    }

    // Track type occurrences for duplicate detection
    const count = seenTypeCodes.get(type.code) ?? 0;
    seenTypeCodes.set(type.code, count + 1);
  }

  // ── Duplicate type detection ────────────────────────────────────────────

  for (const [typeCode, count] of seenTypeCodes) {
    if (count > 1) {
      issues.push({
        code: 'duplicate_component_type',
        message: `Multiple components of type "${typeCode}" are attached. This may cause ambiguity in prompt assembly.`,
        severity: 'warning',
        component_type_code: typeCode,
      });
    }
  }

  // ── Missing required types ──────────────────────────────────────────────
  // Currently no types are strictly required. This is a placeholder for
  // future business rules. If a type becomes required, add it here.
  // Example:
  // const requiredTypes: ComponentTypeCode[] = ['identity'];
  // for (const required of requiredTypes) {
  //   if (!seenTypeCodes.has(required)) {
  //     issues.push({
  //       code: 'missing_required_type',
  //       message: `Package is missing a required "${required}" component.`,
  //       severity: 'error',
  //       component_type_code: required,
  //     });
  //   }
  // }

  const valid = issues.filter(i => i.severity === 'error').length === 0;

  return { valid, issues };
}
