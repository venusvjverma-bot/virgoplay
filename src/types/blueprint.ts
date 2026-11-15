/**
 * Blueprint Package Foundation V1 — Shared TypeScript Models
 *
 * Blueprint Packages define WHAT should be generated.
 * The Generation Engine defines HOW it is generated.
 *
 * These models are provider-independent. They contain no prompt text, no
 * provider configuration, and no generation logic. A future Blueprint
 * Resolver will translate Blueprint Packages into Generation Snapshots —
 * that bridge is NOT part of this phase.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Status Enums
// ═══════════════════════════════════════════════════════════════════════════

export type BlueprintStatus = 'draft' | 'published' | 'archived';

// ═══════════════════════════════════════════════════════════════════════════
// Component Types — the 12 canonical categories
// ═══════════════════════════════════════════════════════════════════════════

export type ComponentTypeCode =
  | 'identity'
  | 'body'
  | 'dress'
  | 'accessory'
  | 'role'
  | 'environment'
  | 'pose'
  | 'expression'
  | 'camera'
  | 'lighting'
  | 'quality'
  | 'negative_prompt';

export interface BlueprintComponentType {
  id: string;
  code: ComponentTypeCode;
  label: string;
  display_order: number;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Blueprint Components — reusable creative building blocks
// ═══════════════════════════════════════════════════════════════════════════

export interface BlueprintComponent {
  id: string;
  creator_id: string;
  component_type_id: string;
  name: string;
  code: string;
  description: string | null;
  metadata: Record<string, unknown>;
  status: BlueprintStatus;
  version: number;
  version_root_id: string | null;
  parent_component_id: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

/**
 * Component row with its type info joined — used in list/detail views.
 */
export interface BlueprintComponentWithType extends BlueprintComponent {
  component_type?: BlueprintComponentType;
}

// ═══════════════════════════════════════════════════════════════════════════
// Blueprint Packages — ordered collection of component references
// ═══════════════════════════════════════════════════════════════════════════

export interface BlueprintPackage {
  id: string;
  creator_id: string;
  name: string;
  code: string;
  description: string | null;
  metadata: Record<string, unknown>;
  status: BlueprintStatus;
  version: number;
  version_root_id: string | null;
  parent_package_id: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Package-Component References (join table)
// ═══════════════════════════════════════════════════════════════════════════

export interface BlueprintPackageComponent {
  id: string;
  package_id: string;
  component_id: string;
  component_type_id: string;
  display_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Reference row with the component and its type joined — used in the
 * package detail view to show which components are attached.
 */
export interface BlueprintPackageComponentDetail extends BlueprintPackageComponent {
  component?: BlueprintComponentWithType;
  component_type?: BlueprintComponentType;
}

// ═══════════════════════════════════════════════════════════════════════════
// Version Metadata
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Summary of a single version within a version chain.
 * Used to render the version history list.
 */
export interface BlueprintVersionSummary {
  id: string;
  version: number;
  status: BlueprintStatus;
  created_at: string;
  published_at: string | null;
  parent_id: string | null;
  is_current: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// DTOs — data transfer objects for CRUD operations
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateBlueprintPackageInput {
  name: string;
  code: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateBlueprintPackageInput {
  name?: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  status?: BlueprintStatus;
}

export interface CreateBlueprintComponentInput {
  component_type_id: string;
  name: string;
  code: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateBlueprintComponentInput {
  name?: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  status?: BlueprintStatus;
}

export interface AttachComponentInput {
  component_id: string;
  component_type_id: string;
  display_order?: number;
  metadata?: Record<string, unknown>;
}
