/**
 * Stateless Worker Contract
 *
 * Every Generation Worker (Image Worker, Video Worker, Dialogue Worker, and any
 * future worker) MUST implement this contract. The contract is enforced by
 * type-checking against the GenerationWorker interface.
 *
 * ── The worker receives an immutable Generation Snapshot. ──
 *
 * A worker must NEVER:
 *   - Resolve business rules
 *   - Resolve APR / BT / Dress / Accessories / Role / Blueprint
 *   - Build prompts
 *   - Choose providers
 *   - Store permanent business data
 *   - Read unrelated business tables
 *
 * A worker only performs these steps:
 *
 *   Generation Snapshot
 *         │
 *         ▼
 *   Provider Adapter
 *         │
 *   Execute Generation
 *         │
 *   Update Generation Lifecycle
 *         │
 *   Store Output
 *         │
 *   Return Result
 *
 * Nothing else.
 *
 * ── Immutable Snapshot Rule ──
 *
 * The Generation Snapshot is the only source of truth for execution.
 * After the snapshot is created it must never change.
 * Every regeneration creates a new Generation with a new immutable snapshot.
 * Workers must never modify snapshots.
 */

import type {
  GenerationSnapshot,
  ProviderResult,
  AssetType,
} from "./generation-types.ts";

/**
 * Input passed to a worker. Contains only what the worker needs:
 * the generation row ID (for lifecycle updates), the immutable snapshot,
 * and the provider configuration to use.
 */
export interface WorkerInput {
  generationId: string;
  snapshot: GenerationSnapshot;
  providerConfig: import("./generation-types.ts").ProviderConfig;
}

/**
 * Result returned by a worker after execution.
 */
export interface WorkerResult {
  status: "completed" | "processing" | "failed";
  outputUrl?: string;
  outputData?: string;
  outputMetadata?: Record<string, unknown>;
  providerGenerationId?: string;
  error?: string;
  errorDetails?: Record<string, unknown>;
}

/**
 * The contract every Generation Worker must implement.
 *
 * The `assetType` property declares which asset type this worker handles.
 * The `execute` method receives a WorkerInput and returns a WorkerResult.
 *
 * The worker must NOT:
 *   - Import or query business tables (master_ai_identities, ai_dress_library,
 *     ai_role_blueprints, creator_uniform_library, etc.)
 *   - Build prompts from business data
 *   - Choose which provider to use (that is decided before the worker is called)
 *   - Modify the snapshot
 *
 * The worker MUST:
 *   - Use the provider adapter to execute the generation
 *   - Use GenerationLifecycle to update status transitions
 *   - Store output in Supabase Storage
 *   - Return a WorkerResult
 */
export interface GenerationWorker {
  readonly assetType: AssetType;
  execute(input: WorkerInput): Promise<WorkerResult>;
}

/**
 * Registry of asset type → worker implementation.
 * Workers register themselves here at startup.
 *
 * To add a new worker:
 *   1. Implement the GenerationWorker interface
 *   2. Add an entry to WORKER_REGISTRY
 *
 * The dispatcher will look up the worker by asset type.
 */
export const WORKER_REGISTRY: Partial<Record<AssetType, GenerationWorker>> = {};

export function registerWorker(assetType: AssetType, worker: GenerationWorker): void {
  WORKER_REGISTRY[assetType] = worker;
}

export function getWorker(assetType: AssetType): GenerationWorker | null {
  return WORKER_REGISTRY[assetType] ?? null;
}
