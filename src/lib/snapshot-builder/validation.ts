/**
 * Snapshot Builder Foundation V1 — Validation Layer
 *
 * Pure functions that validate a resolved blueprint package and build request
 * before snapshot assembly. No side effects, no database access, no I/O.
 *
 * This makes the validation layer trivially unit-testable: pass in the
 * resolved package and build request, get back issues. No mocking required.
 */

import type { ComponentTypeCode } from '../../types/blueprint';
import type { AssetType, AssetSubtype } from '../../types/generation';
import type { ResolvedBlueprintPackage } from '../blueprint-resolver/types';
import type {
  SnapshotValidationIssue,
  SnapshotValidationResult,
  SnapshotValidationIssueCode,
} from './types';

/**
 * Valid asset type → subtype pairings. An error is raised if the combination
 * is not in this set. This prevents nonsensical snapshots (e.g. audio asset
 * with a character_identity subtype).
 */
const VALID_ASSET_PAIRINGS: ReadonlySet<string> = new Set([
  'image:character_identity',
  'image:role_image',
  'image:storyboard_image',
  'image:uniform',
  'image:appearance_preset',
  'image:body_type_preset',
  'image:scene',
  'image:future',
  'video:scene',
  'video:future',
  'audio:dialogue',
  'audio:future',
  'text:dialogue',
  'text:future',
  'face_swap:character_identity',
  'face_swap:role_image',
  'face_swap:future',
]);

/**
 * Validate the resolved package and build request before snapshot assembly.
 *
 * Checks:
 * 1. The resolved package passed its own validation (no error-severity issues).
 * 2. The package is published (warning if draft, error if archived).
 * 3. No components are archived (warning) or draft within a published package (warning).
 * 4. No duplicate component types (warning).
 * 5. Render technique is non-empty (error).
 * 6. Asset type/subtype pairing is valid (error).
 * 7. Package has at least one component (error).
 */
export function validateSnapshotBuild(
  resolvedPackage: ResolvedBlueprintPackage,
  assetType: AssetType,
  assetSubtype: AssetSubtype,
  renderTechnique: string,
): SnapshotValidationResult {
  const issues: SnapshotValidationIssue[] = [];

  // ── Check 1: Resolved package must be valid ─────────────────────────────
  if (!resolvedPackage.validation.valid) {
    issues.push({
      code: 'resolved_package_invalid',
      message: 'The resolved blueprint package has validation errors from the Resolver.',
      severity: 'error',
    });
  }

  // ── Check 2: Package status ─────────────────────────────────────────────
  const pkgStatus = resolvedPackage.package.status;
  if (pkgStatus === 'archived') {
    issues.push({
      code: 'package_not_published',
      message: `Package "${resolvedPackage.package.name}" is archived. Snapshots from archived packages may be stale.`,
      severity: 'error',
    });
  } else if (pkgStatus === 'draft') {
    issues.push({
      code: 'package_not_published',
      message: `Package "${resolvedPackage.package.name}" is in draft status. Consider publishing before generating.`,
      severity: 'warning',
    });
  }

  // ── Check 3: Component statuses ─────────────────────────────────────────
  const seenTypeCodes = new Map<ComponentTypeCode, number>();

  for (const component of resolvedPackage.components) {
    if (component.status === 'archived') {
      issues.push({
        code: 'component_archived',
        message: `Component "${component.name}" (${component.type_code}) is archived.`,
        severity: 'warning',
        component_type_code: component.type_code,
      });
    } else if (component.status === 'draft' && pkgStatus === 'published') {
      issues.push({
        code: 'component_not_published',
        message: `Component "${component.name}" (${component.type_code}) is still in draft within a published package.`,
        severity: 'warning',
        component_type_code: component.type_code,
      });
    }

    const count = seenTypeCodes.get(component.type_code) ?? 0;
    seenTypeCodes.set(component.type_code, count + 1);
  }

  // ── Check 4: Duplicate component types ──────────────────────────────────
  for (const [typeCode, count] of seenTypeCodes) {
    if (count > 1) {
      issues.push({
        code: 'duplicate_component_type',
        message: `Multiple components of type "${typeCode}" are present. This may cause ambiguity in prompt assembly.`,
        severity: 'warning',
        component_type_code: typeCode,
      });
    }
  }

  // ── Check 5: Render technique ───────────────────────────────────────────
  if (!renderTechnique || renderTechnique.trim() === '') {
    issues.push({
      code: 'render_technique_empty',
      message: 'A render technique identifier is required.',
      severity: 'error',
    });
  }

  // ── Check 6: Asset type/subtype pairing ─────────────────────────────────
  const pairing = `${assetType}:${assetSubtype}`;
  if (!VALID_ASSET_PAIRINGS.has(pairing)) {
    issues.push({
      code: 'asset_type_subtype_mismatch',
      message: `Asset type "${assetType}" with subtype "${assetSubtype}" is not a valid pairing.`,
      severity: 'error',
    });
  }

  // ── Check 7: Non-empty package ──────────────────────────────────────────
  if (resolvedPackage.components.length === 0) {
    issues.push({
      code: 'resolved_package_empty',
      message: 'The resolved blueprint package has no components. A snapshot requires at least one component.',
      severity: 'error',
    });
  }

  const valid = issues.filter(i => i.severity === 'error').length === 0;

  return { valid, issues };
}

/**
 * Convenience function to check if a validation result has any error-severity
 * issues. Useful for early returns in the builder.
 */
export function hasErrors(result: SnapshotValidationResult): boolean {
  return !result.valid;
}

/**
 * Extract only error-severity issues from a validation result.
 */
export function getErrors(result: SnapshotValidationResult): readonly SnapshotValidationIssue[] {
  return result.issues.filter(i => i.severity === 'error');
}
