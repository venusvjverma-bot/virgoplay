/**
 * Blueprint Resolver Foundation — Shared TypeScript Models
 *
 * The Resolver transforms a Blueprint Package (a collection of component
 * references) into a single immutable ResolvedBlueprintPackage object.
 *
 * This module is provider-independent, stateless, and has zero knowledge of
 * the Generation Engine, prompt builders, dispatchers, or workers. It only
 * knows how to load, validate, and assemble Blueprint data.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BlueprintStatus,
  ComponentTypeCode,
  BlueprintComponentType,
  BlueprintComponent,
  BlueprintPackage,
  BlueprintPackageComponent,
} from '../../types/blueprint';

// ═══════════════════════════════════════════════════════════════════════════
// Resolver Input
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Input to the resolver — identifies which package version to resolve.
 */
export interface ResolveRequest {
  packageId: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation Layer
// ═══════════════════════════════════════════════════════════════════════════

export type ValidationSeverity = 'error' | 'warning';

/**
 * A single validation issue found during resolution.
 * `code` is machine-readable for programmatic handling; `message` is human-readable.
 */
export interface ValidationIssue {
  code: ValidationIssueCode;
  message: string;
  severity: ValidationSeverity;
  component_id?: string;
  component_type_code?: ComponentTypeCode;
}

/**
 * Machine-readable validation issue codes.
 */
export type ValidationIssueCode =
  | 'package_not_found'
  | 'package_archived'
  | 'component_not_found'
  | 'component_archived'
  | 'component_not_published'
  | 'duplicate_component_type'
  | 'missing_required_type'
  | 'empty_package'
  | 'join_record_missing_type';

/**
 * Result of validating a resolved package.
 * `valid` is true only when there are zero error-severity issues.
 */
export interface ValidationResult {
  valid: boolean;
  issues: readonly ValidationIssue[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Resolved Output Model
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single component that has been loaded, dereferenced, and validated.
 * This is the fully-resolved form — no lazy loading or dangling references.
 *
 * `readonly` markers enforce immutability of the assembled output.
 */
export interface ResolvedComponent {
  readonly id: string;
  readonly type_code: ComponentTypeCode;
  readonly type_label: string;
  readonly type_display_order: number;
  readonly name: string;
  readonly code: string;
  readonly description: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly status: BlueprintStatus;
  readonly version: number;
  readonly version_root_id: string | null;
  readonly parent_component_id: string | null;
  readonly published_at: string | null;
  /** Display order from the join table — ordering within the package. */
  readonly display_order: number;
  /** Per-reference metadata overrides from the join table. */
  readonly reference_metadata: Readonly<Record<string, unknown>>;
}

/**
 * Package-level metadata in the resolved output.
 * A snapshot of the package row at resolution time.
 */
export interface ResolvedPackageMeta {
  readonly id: string;
  readonly creator_id: string;
  readonly name: string;
  readonly code: string;
  readonly description: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly status: BlueprintStatus;
  readonly version: number;
  readonly version_root_id: string | null;
  readonly parent_package_id: string | null;
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * The complete, immutable output of the Blueprint Resolver.
 *
 * Contains:
 * - Package metadata (version, status, etc.)
 * - Fully loaded and dereferenced component list
 * - Component metadata and versions
 * - Relationships (ordered component list preserving package ordering)
 * - Validation status
 *
 * Contains NO prompt text, NO provider configuration, NO generation snapshot,
 * and NO Generation Engine integration.
 *
 * This object is frozen at construction time. Callers must not mutate it.
 */
export interface ResolvedBlueprintPackage {
  readonly package: ResolvedPackageMeta;
  readonly components: readonly ResolvedComponent[];
  readonly validation: ValidationResult;
  /** ISO timestamp of when resolution completed. */
  readonly resolved_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Resolver Result — discriminated union for error handling
// ═══════════════════════════════════════════════════════════════════════════

export type ResolverErrorCode =
  | 'package_not_found'
  | 'database_error'
  | 'validation_failed';

/**
 * Error returned when resolution fails before producing a resolved package.
 * Validation issues that don't prevent assembly are included in the resolved
 * object's `validation` field instead — this error is for hard failures only.
 */
export interface ResolverError {
  code: ResolverErrorCode;
  message: string;
  issues?: readonly ValidationIssue[];
}

/**
 * Discriminated union: either a successfully resolved package or an error.
 */
export type ResolverResult =
  | { readonly ok: true; readonly resolved: ResolvedBlueprintPackage }
  | { readonly ok: false; readonly error: ResolverError };

// ═══════════════════════════════════════════════════════════════════════════
// Resolver Interface — for testability and dependency injection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The contract for a Blueprint Resolver implementation.
 *
 * Stateless: the same input always produces the same output (assuming no
 * database changes between calls). No internal state is retained.
 *
 * Provider-independent: knows nothing about providers, prompts, or the
 * Generation Engine.
 */
export interface BlueprintResolver {
  /**
   * Resolve a Blueprint Package by ID.
   *
   * Steps:
   * 1. Load the Blueprint Package row.
   * 2. Load all referenced Blueprint Components via the join table.
   * 3. Validate: package exists, components exist, versions are immutable,
   *    no missing references, no duplicate types, no empty packages.
   * 4. Assemble one immutable ResolvedBlueprintPackage.
   * 5. Return it.
   */
  resolve(
    client: SupabaseClient,
    request: ResolveRequest,
  ): Promise<ResolverResult>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal loader types (not exported to consumers)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Raw data loaded from the database before assembly.
 * Used internally by the resolver implementation.
 */
export interface LoadedPackageData {
  pkg: BlueprintPackage;
  componentTypes: Map<string, BlueprintComponentType>;
  components: Map<string, BlueprintComponent>;
  refs: BlueprintPackageComponent[];
}
