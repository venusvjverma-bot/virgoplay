/**
 * Blueprint Resolver Foundation — Core Service
 *
 * The Resolver sits between Blueprint Packages and the Generation Engine.
 * Its sole responsibility is to assemble Blueprint Components into one
 * immutable ResolvedBlueprintPackage object.
 *
 * It is:
 * - Provider independent — no knowledge of providers, prompt builders, or
 *   generation logic.
 * - Immutable — the output object is frozen and never mutated.
 * - Stateless — no internal state retained between calls.
 * - Testable — pure data transformation after loading; validation is
 *   extracted into a separate module with no I/O.
 * - Reusable — any caller can resolve any package by ID.
 *
 * Flow:
 * 1. Load Blueprint Package.
 * 2. Load all referenced Blueprint Components (via join table).
 * 3. Load component types for dereferencing.
 * 4. Validate (package exists, components exist, no missing references,
 *    no duplicate types, versions are immutable).
 * 5. Assemble one immutable ResolvedBlueprintPackage.
 * 6. Return it.
 *
 * It does NOT:
 * - Generate prompt text.
 * - Call the Generation Engine.
 * - Create snapshots.
 * - Integrate with the dispatcher or workers.
 * - Know about provider configurations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BlueprintComponent,
  BlueprintComponentType,
  BlueprintPackage,
  BlueprintPackageComponent,
} from '../../types/blueprint';
import type {
  ResolvedBlueprintPackage,
  ResolvedComponent,
  ResolvedPackageMeta,
  ResolverResult,
  ResolveRequest,
  ValidationIssue,
} from './types';
import { validatePackage } from './validation';

// ═══════════════════════════════════════════════════════════════════════════
// Loader functions — each loads one piece of the puzzle
// ═══════════════════════════════════════════════════════════════════════════

async function loadPackage(
  client: SupabaseClient,
  packageId: string,
): Promise<{ pkg: BlueprintPackage | null; error: string | null }> {
  const { data, error } = await client
    .from('blueprint_packages')
    .select('*')
    .eq('id', packageId)
    .maybeSingle();

  if (error) return { pkg: null, error: error.message };
  return { pkg: data as BlueprintPackage | null, error: null };
}

async function loadComponentRefs(
  client: SupabaseClient,
  packageId: string,
): Promise<{ refs: BlueprintPackageComponent[]; error: string | null }> {
  const { data, error } = await client
    .from('blueprint_package_components')
    .select('*')
    .eq('package_id', packageId)
    .order('display_order', { ascending: true });

  if (error) return { refs: [], error: error.message };
  return { refs: (data ?? []) as BlueprintPackageComponent[], error: null };
}

async function loadComponents(
  client: SupabaseClient,
  componentIds: string[],
): Promise<{ components: Map<string, BlueprintComponent>; error: string | null }> {
  const map = new Map<string, BlueprintComponent>();
  if (componentIds.length === 0) return { components: map, error: null };

  const { data, error } = await client
    .from('blueprint_components')
    .select('*')
    .in('id', componentIds);

  if (error) return { components: map, error: error.message };

  for (const row of data ?? []) {
    map.set(row.id, row as BlueprintComponent);
  }
  return { components: map, error: null };
}

async function loadComponentTypes(
  client: SupabaseClient,
  typeIds: string[],
): Promise<{ types: Map<string, BlueprintComponentType>; error: string | null }> {
  const map = new Map<string, BlueprintComponentType>();
  if (typeIds.length === 0) return { types: map, error: null };

  const { data, error } = await client
    .from('blueprint_component_types')
    .select('*')
    .in('id', typeIds);

  if (error) return { types: map, error: error.message };

  for (const row of data ?? []) {
    map.set(row.id, row as BlueprintComponentType);
  }
  return { types: map, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// Assembly — pure transformation from loaded data to resolved output
// ═══════════════════════════════════════════════════════════════════════════

function assemblePackageMeta(pkg: BlueprintPackage): ResolvedPackageMeta {
  return Object.freeze({
    id: pkg.id,
    creator_id: pkg.creator_id,
    name: pkg.name,
    code: pkg.code,
    description: pkg.description,
    metadata: Object.freeze({ ...pkg.metadata }) as Readonly<Record<string, unknown>>,
    status: pkg.status,
    version: pkg.version,
    version_root_id: pkg.version_root_id,
    parent_package_id: pkg.parent_package_id,
    published_at: pkg.published_at,
    created_at: pkg.created_at,
    updated_at: pkg.updated_at,
  });
}

function assembleComponent(
  component: BlueprintComponent,
  type: BlueprintComponentType,
  ref: BlueprintPackageComponent,
): ResolvedComponent {
  return Object.freeze({
    id: component.id,
    type_code: type.code,
    type_label: type.label,
    type_display_order: type.display_order,
    name: component.name,
    code: component.code,
    description: component.description,
    metadata: Object.freeze({ ...component.metadata }) as Readonly<Record<string, unknown>>,
    status: component.status,
    version: component.version,
    version_root_id: component.version_root_id,
    parent_component_id: component.parent_component_id,
    published_at: component.published_at,
    display_order: ref.display_order,
    reference_metadata: Object.freeze({ ...ref.metadata }) as Readonly<Record<string, unknown>>,
  });
}

function assembleResolvedPackage(
  pkg: BlueprintPackage,
  refs: BlueprintPackageComponent[],
  components: Map<string, BlueprintComponent>,
  componentTypes: Map<string, BlueprintComponentType>,
  issues: readonly ValidationIssue[],
): ResolvedBlueprintPackage {
  const packageMeta = assemblePackageMeta(pkg);

  const resolvedComponents: ResolvedComponent[] = refs
    .map(ref => {
      const component = components.get(ref.component_id);
      if (!component) return null;
      const type = componentTypes.get(component.component_type_id);
      if (!type) return null;
      return assembleComponent(component, type, ref);
    })
    .filter((c): c is ResolvedComponent => c !== null);

  return Object.freeze({
    package: packageMeta,
    components: Object.freeze(resolvedComponents),
    validation: Object.freeze({
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues: Object.freeze([...issues]),
    }),
    resolved_at: new Date().toISOString(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Public resolver — the single entry point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve a Blueprint Package into an immutable ResolvedBlueprintPackage.
 *
 * @param client - Supabase client (passed in for testability and auth context)
 * @param request - Identifies the package to resolve
 * @returns Discriminated union: { ok: true, resolved } or { ok: false, error }
 *
 * @example
 * const result = await resolveBlueprintPackage(supabase, { packageId: 'uuid' });
 * if (result.ok) {
 *   console.log(result.resolved.components.length);
 * } else {
 *   console.error(result.error.message);
 * }
 */
export async function resolveBlueprintPackage(
  client: SupabaseClient,
  request: ResolveRequest,
): Promise<ResolverResult> {
  // ── Step 1: Load the package ──────────────────────────────────────────
  const { pkg, error: pkgError } = await loadPackage(client, request.packageId);

  if (pkgError) {
    return {
      ok: false,
      error: { code: 'database_error', message: pkgError },
    };
  }

  if (!pkg) {
    return {
      ok: false,
      error: {
        code: 'package_not_found',
        message: `Blueprint Package ${request.packageId} was not found.`,
      },
    };
  }

  // ── Step 2: Load component references (join table) ──────────────────
  const { refs, error: refsError } = await loadComponentRefs(client, request.packageId);

  if (refsError) {
    return {
      ok: false,
      error: { code: 'database_error', message: refsError },
    };
  }

  // ── Step 3: Load all referenced components ────────────────────────────
  const componentIds = [...new Set(refs.map(r => r.component_id))];
  const { components, error: componentsError } = await loadComponents(client, componentIds);

  if (componentsError) {
    return {
      ok: false,
      error: { code: 'database_error', message: componentsError },
    };
  }

  // ── Step 4: Load component types (for dereferencing) ──────────────────
  const typeIds = [...new Set([...components.values()].map(c => c.component_type_id))];
  const { types: componentTypes, error: typesError } = await loadComponentTypes(client, typeIds);

  if (typesError) {
    return {
      ok: false,
      error: { code: 'database_error', message: typesError },
    };
  }

  // ── Step 5: Validate ─────────────────────────────────────────────────
  const validation = validatePackage(pkg, refs, components, componentTypes);

  // ── Step 6: Assemble and return ──────────────────────────────────────
  const resolved = assembleResolvedPackage(
    pkg,
    refs,
    components,
    componentTypes,
    validation.issues,
  );

  return { ok: true, resolved };
}
