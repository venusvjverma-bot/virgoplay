/**
 * Blueprint Resolver Foundation — Barrel Export
 *
 * Single import point for all Resolver consumers.
 *
 * Usage:
 *   import { resolveBlueprintPackage, type ResolvedBlueprintPackage } from '@/lib/blueprint-resolver';
 *
 * The Resolver is provider-independent, stateless, and immutable. It transforms
 * a Blueprint Package into a ResolvedBlueprintPackage — nothing more.
 */

export { resolveBlueprintPackage } from './resolver';
export { validatePackage } from './validation';

export type {
  ResolveRequest,
  ResolvedBlueprintPackage,
  ResolvedPackageMeta,
  ResolvedComponent,
  ValidationResult,
  ValidationIssue,
  ValidationSeverity,
  ValidationIssueCode,
  ResolverResult,
  ResolverError,
  ResolverErrorCode,
  BlueprintResolver,
  LoadedPackageData,
} from './types';
