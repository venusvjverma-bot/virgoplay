/**
 * Snapshot Builder Foundation V1 — Core Service
 *
 * The Snapshot Builder sits between the Blueprint Resolver and the Generation
 * Engine. It accepts a fully resolved ResolvedBlueprintPackage and assembles a
 * provider-neutral BlueprintSnapshot — an immutable object containing all the
 * blueprint references, component metadata, and generation metadata needed for
 * downstream prompt assembly and generation.
 *
 * It is:
 * - Provider independent — no knowledge of providers, prompt builders, or
 *   generation logic.
 * - Immutable — the output object is frozen and never mutated.
 * - Stateless — no internal state retained between calls.
 * - Testable — pure data transformation; validation is extracted into a
 *   separate module with no I/O.
 * - Reusable — any caller can build a snapshot from any resolved package.
 *
 * Flow:
 * 1. Validate the resolved blueprint package.
 * 2. Validate the build request (asset type, render technique).
 * 3. Assemble the immutable BlueprintSnapshot.
 * 4. Return it.
 *
 * It does NOT:
 * - Generate prompt text.
 * - Call Prompt Builders.
 * - Call the Dispatcher.
 * - Call Workers.
 * - Call Providers.
 * - Insert into the generations table.
 * - Modify Blueprint Packages.
 * - Modify the Generation Engine.
 */

import type {
  AssetType,
  AssetSubtype,
  BusinessRefType,
} from '../../types/generation';
import type { ResolvedBlueprintPackage } from '../blueprint-resolver/types';
import type {
  BlueprintSnapshot,
  SnapshotBlueprintReference,
  SnapshotBuildRequest,
  SnapshotBuilderResult,
  SnapshotComponentEntry,
  SnapshotGenerationMeta,
  SnapshotValidationResult,
} from './types';
import { validateSnapshotBuild } from './validation';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The schema version of the BlueprintSnapshot shape. Increment this if the
 * output model changes in a way that breaks backward compatibility.
 */
const SNAPSHOT_SCHEMA_VERSION = 1;

// ═══════════════════════════════════════════════════════════════════════════
// Assembly — pure transformation from resolved package to snapshot
// ═══════════════════════════════════════════════════════════════════════════

function assembleBlueprintReference(
  resolved: ResolvedBlueprintPackage,
): SnapshotBlueprintReference {
  const pkg = resolved.package;
  return Object.freeze({
    package_id: pkg.id,
    package_code: pkg.code,
    package_name: pkg.name,
    package_version: pkg.version,
    package_version_root_id: pkg.version_root_id,
    package_status: pkg.status,
    resolved_at: resolved.resolved_at,
  });
}

function assembleGenerationMeta(
  assetType: AssetType,
  assetSubtype: AssetSubtype,
  renderTechnique: string,
  businessRefType: BusinessRefType | undefined,
  businessRefId: string | undefined,
): SnapshotGenerationMeta {
  return Object.freeze({
    asset_type: assetType,
    asset_subtype: assetSubtype,
    render_technique: renderTechnique,
    business_ref_type: businessRefType ?? null,
    business_ref_id: businessRefId ?? null,
    snapshot_version: SNAPSHOT_SCHEMA_VERSION,
    built_at: new Date().toISOString(),
  });
}

function assembleComponentEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: any,
): SnapshotComponentEntry {
  return Object.freeze({
    id: component.id,
    type_code: component.type_code,
    type_label: component.type_label,
    name: component.name,
    code: component.code,
    description: component.description,
    metadata: Object.freeze({ ...component.metadata }) as Readonly<Record<string, unknown>>,
    reference_metadata: Object.freeze({ ...component.reference_metadata }) as Readonly<Record<string, unknown>>,
    version: component.version,
    display_order: component.display_order,
  });
}

function assembleSnapshot(
  resolved: ResolvedBlueprintPackage,
  assetType: AssetType,
  assetSubtype: AssetSubtype,
  renderTechnique: string,
  businessRefType: BusinessRefType | undefined,
  businessRefId: string | undefined,
  validation: SnapshotValidationResult,
): BlueprintSnapshot {
  const blueprint = assembleBlueprintReference(resolved);
  const generation = assembleGenerationMeta(
    assetType,
    assetSubtype,
    renderTechnique,
    businessRefType,
    businessRefId,
  );
  const components = Object.freeze(
    resolved.components.map(assembleComponentEntry),
  );

  return Object.freeze({
    blueprint,
    generation,
    components,
    validation: Object.freeze({
      valid: validation.valid,
      issues: Object.freeze([...validation.issues]),
    }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Public builder — the single entry point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a provider-neutral BlueprintSnapshot from a resolved package.
 *
 * @param request - Contains the resolved package and generation parameters
 * @returns Discriminated union: { ok: true, snapshot } or { ok: false, error }
 *
 * @example
 * const result = buildBlueprintSnapshot({
 *   resolvedPackage,
 *   asset_type: 'image',
 *   asset_subtype: 'character_identity',
 *   render_technique: 'text_to_image',
 * });
 * if (result.ok) {
 *   console.log(result.snapshot.components.length);
 * } else {
 *   console.error(result.error.message);
 * }
 */
export function buildBlueprintSnapshot(
  request: SnapshotBuildRequest,
): SnapshotBuilderResult {
  const { resolvedPackage, asset_type, asset_subtype, render_technique, business_ref_type, business_ref_id } = request;

  // ── Step 1 & 2: Validate ───────────────────────────────────────────────
  const validation = validateSnapshotBuild(
    resolvedPackage,
    asset_type,
    asset_subtype,
    render_technique,
  );

  if (!validation.valid) {
    return {
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'Snapshot build failed validation. See issues for details.',
        issues: validation.issues,
      },
    };
  }

  // ── Step 3: Assemble ───────────────────────────────────────────────────
  const snapshot = assembleSnapshot(
    resolvedPackage,
    asset_type,
    asset_subtype,
    render_technique,
    business_ref_type,
    business_ref_id,
    validation,
  );

  // ── Step 4: Return ─────────────────────────────────────────────────────
  return { ok: true, snapshot };
}
