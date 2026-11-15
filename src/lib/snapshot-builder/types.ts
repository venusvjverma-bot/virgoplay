/**
 * Snapshot Builder Foundation V1 — Shared TypeScript Models
 *
 * The Snapshot Builder sits between the Blueprint Resolver and the Generation
 * Engine. It accepts a fully resolved ResolvedBlueprintPackage and assembles a
 * provider-neutral BlueprintSnapshot — an immutable object containing all the
 * blueprint references, component metadata, and generation metadata needed to
 * eventually produce a GenerationSnapshot.
 *
 * The BlueprintSnapshot deliberately contains NO prompt text, NO provider
 * configuration, and NO provider parameters. Those are populated by downstream
 * phases (Prompt Builders, the Dispatcher) that are NOT part of this foundation.
 *
 * This module is:
 * - Provider independent — no knowledge of any provider, adapter, or provider config.
 * - Immutable — the output object is frozen and never mutated.
 * - Stateless — no internal state retained between calls.
 * - Testable — pure data transformation; validation is extracted to a separate module.
 * - Reusable — any caller can build a snapshot from any resolved package.
 */

import type {
  AssetType,
  AssetSubtype,
  BusinessRefType,
} from '../../types/generation';
import type { ComponentTypeCode } from '../../types/blueprint';
import type { ResolvedBlueprintPackage } from '../blueprint-resolver/types';

// ═══════════════════════════════════════════════════════════════════════════
// Builder Input
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Request to build a BlueprintSnapshot from a resolved package.
 *
 * `asset_type` and `asset_subtype` classify what kind of generation this
 * snapshot is for. `render_technique` identifies the rendering approach
 * (e.g. "text_to_image", "face_swap", "img2img"). `business_ref` optionally
 * links the snapshot to a business table row that will own the result.
 */
export interface SnapshotBuildRequest {
  /** The fully resolved blueprint package from the Blueprint Resolver. */
  resolvedPackage: ResolvedBlueprintPackage;
  /** What kind of asset this snapshot will produce. */
  asset_type: AssetType;
  /** Specific subtype within the asset type. */
  asset_subtype: AssetSubtype;
  /** Render technique identifier — e.g. "text_to_image", "face_swap". */
  render_technique: string;
  /** Optional business table reference for the generation result. */
  business_ref_type?: BusinessRefType;
  business_ref_id?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation Layer
// ═══════════════════════════════════════════════════════════════════════════

export type SnapshotValidationSeverity = 'error' | 'warning';

export interface SnapshotValidationIssue {
  code: SnapshotValidationIssueCode;
  message: string;
  severity: SnapshotValidationSeverity;
  component_type_code?: ComponentTypeCode;
}

export type SnapshotValidationIssueCode =
  | 'resolved_package_invalid'
  | 'resolved_package_empty'
  | 'package_not_published'
  | 'component_not_published'
  | 'component_archived'
  | 'duplicate_component_type'
  | 'missing_required_type'
  | 'render_technique_empty'
  | 'asset_type_subtype_mismatch';

export interface SnapshotValidationResult {
  valid: boolean;
  issues: readonly SnapshotValidationIssue[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Snapshot Output Model — provider-neutral, immutable
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single component's metadata captured in the snapshot.
 * This is a projection of ResolvedComponent — only the fields needed for
 * downstream prompt assembly and generation, with no mutable references.
 */
export interface SnapshotComponentEntry {
  readonly id: string;
  readonly type_code: ComponentTypeCode;
  readonly type_label: string;
  readonly name: string;
  readonly code: string;
  readonly description: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly reference_metadata: Readonly<Record<string, unknown>>;
  readonly version: number;
  readonly display_order: number;
}

/**
 * Blueprint reference — identifies the exact package version this snapshot
 * was built from. Enables reproducibility and regeneration.
 */
export interface SnapshotBlueprintReference {
  readonly package_id: string;
  readonly package_code: string;
  readonly package_name: string;
  readonly package_version: number;
  readonly package_version_root_id: string | null;
  readonly package_status: string;
  readonly resolved_at: string;
}

/**
 * Generation metadata — immutable context captured at snapshot build time.
 */
export interface SnapshotGenerationMeta {
  readonly asset_type: AssetType;
  readonly asset_subtype: AssetSubtype;
  readonly render_technique: string;
  readonly business_ref_type: string | null;
  readonly business_ref_id: string | null;
  /** Snapshot schema version — increments if the BlueprintSnapshot shape changes. */
  readonly snapshot_version: number;
  /** ISO timestamp of when the snapshot was built. */
  readonly built_at: string;
}

/**
 * The complete, immutable BlueprintSnapshot.
 *
 * This is the provider-neutral output of the Snapshot Builder. It contains:
 * - Blueprint references (which package, which version)
 * - Component metadata (all components organized by type)
 * - Generation metadata (asset type, subtype, render technique, timestamps)
 * - Validation status
 *
 * It contains NO prompt text, NO provider configuration, NO provider parameters,
 * NO input asset URLs, and NO Generation Engine integration.
 *
 * This object is frozen at construction time. Callers must not mutate it.
 *
 * A future Prompt Builder phase will consume this snapshot, generate prompt
 * text, and produce the full GenerationSnapshot that the Generation Engine
 * expects. That bridge is NOT part of this foundation.
 */
export interface BlueprintSnapshot {
  readonly blueprint: SnapshotBlueprintReference;
  readonly generation: SnapshotGenerationMeta;
  readonly components: readonly SnapshotComponentEntry[];
  readonly validation: SnapshotValidationResult;
}

// ═══════════════════════════════════════════════════════════════════════════
// Builder Result — discriminated union for error handling
// ═══════════════════════════════════════════════════════════════════════════

export type SnapshotBuilderErrorCode =
  | 'validation_failed'
  | 'invalid_request';

export interface SnapshotBuilderError {
  code: SnapshotBuilderErrorCode;
  message: string;
  issues?: readonly SnapshotValidationIssue[];
}

export type SnapshotBuilderResult =
  | { readonly ok: true; readonly snapshot: BlueprintSnapshot }
  | { readonly ok: false; readonly error: SnapshotBuilderError };

// ═══════════════════════════════════════════════════════════════════════════
// Builder Interface — for testability and dependency injection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The contract for a Snapshot Builder implementation.
 *
 * Stateless: the same input always produces the same output. No internal
 * state is retained.
 *
 * Provider-independent: knows nothing about providers, prompts, or the
 * Generation Engine internals.
 */
export interface SnapshotBuilder {
  /**
   * Build a provider-neutral BlueprintSnapshot from a resolved package.
   *
   * Steps:
   * 1. Validate the resolved blueprint package.
   * 2. Validate the build request (asset type, render technique).
   * 3. Assemble the immutable BlueprintSnapshot.
   * 4. Return it.
   */
  build(request: SnapshotBuildRequest): SnapshotBuilderResult;
}
