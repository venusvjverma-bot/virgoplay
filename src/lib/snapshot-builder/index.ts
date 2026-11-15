/**
 * Snapshot Builder Foundation V1 — Barrel Export
 *
 * Single import point for all Snapshot Builder consumers.
 *
 * Usage:
 *   import { buildBlueprintSnapshot, type BlueprintSnapshot } from '@/lib/snapshot-builder';
 *
 * The Snapshot Builder is provider-independent, stateless, and immutable. It
 * transforms a ResolvedBlueprintPackage into a BlueprintSnapshot — nothing more.
 */

export { buildBlueprintSnapshot } from './builder';
export {
  validateSnapshotBuild,
  hasErrors,
  getErrors,
} from './validation';

export type {
  SnapshotBuildRequest,
  BlueprintSnapshot,
  SnapshotBlueprintReference,
  SnapshotGenerationMeta,
  SnapshotComponentEntry,
  SnapshotValidationResult,
  SnapshotValidationIssue,
  SnapshotValidationSeverity,
  SnapshotValidationIssueCode,
  SnapshotBuilderResult,
  SnapshotBuilderError,
  SnapshotBuilderErrorCode,
  SnapshotBuilder,
} from './types';
