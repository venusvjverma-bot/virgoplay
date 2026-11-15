/**
 * Generation Orchestrator — Types
 *
 * The Orchestrator is the sole conductor of the Mother Creator generation
 * pipeline. It coordinates the flow between frozen foundations:
 *
 *   Blueprint Resolver → Snapshot Builder → Prompt Builder → Dispatcher
 *
 * It never generates prompts, resolves blueprint logic, creates snapshots,
 * calls providers, or performs worker logic. It only calls each foundation
 * in sequence and returns the result.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssetType, AssetSubtype, BusinessRefType, GenerationSnapshot, GenerationStatus } from '../../types/generation';

/**
 * Request to start a full generation pipeline from a Blueprint Package.
 */
export interface OrchestratorRequest {
  /** The Blueprint Package to generate from. */
  packageId: string;
  /** What kind of asset to produce. */
  asset_type: AssetType;
  /** Specific subtype within the asset type. */
  asset_subtype: AssetSubtype;
  /** Render technique — e.g. "text_to_image", "face_swap". */
  render_technique: string;
  /** Optional business table reference for the result. */
  business_ref_type?: BusinessRefType;
  business_ref_id?: string;
  /** Optional provider name for prompt formatting. */
  providerName?: string;
  /** Optional provider parameters passed through to the snapshot. */
  providerParameters?: Record<string, unknown>;
  /** Optional input asset URLs. */
  inputAssets?: Record<string, string>;
  /** Optional parent generation ID for regeneration chains. */
  parentGenerationId?: string;
}

/**
 * Request to regenerate from an existing generation's snapshot.
 * The Orchestrator re-dispatches the frozen snapshot without re-running
 * the resolver/snapshot-builder/prompt-builder pipeline.
 */
export interface RegenerateRequest {
  /** The existing generation to regenerate from. */
  generationId: string;
  /** Override the prompt text in the snapshot (Save Prompt action). */
  promptOverride?: string;
  /** Link the new generation as a versioned child of the original. */
  parentGenerationId?: string;
}

/**
 * The result of an orchestration — either a successfully dispatched
 * generation or an error at one of the pipeline stages.
 */
export type OrchestratorResult =
  | { readonly ok: true; readonly generationId: string; readonly status: GenerationStatus }
  | { readonly ok: false; readonly error: OrchestratorError };

export type OrchestratorErrorCode =
  | 'resolver_failed'
  | 'snapshot_build_failed'
  | 'prompt_build_failed'
  | 'dispatch_failed'
  | 'generation_not_found'
  | 'snapshot_missing';

export interface OrchestratorError {
  code: OrchestratorErrorCode;
  message: string;
  /** Stage where the error occurred, for diagnostics. */
  stage?: 'resolve' | 'snapshot' | 'prompt' | 'dispatch';
}

/**
 * The contract for the Generation Orchestrator.
 */
export interface GenerationOrchestrator {
  /** Run the full pipeline: resolve → snapshot → prompt → dispatch. */
  generate(client: SupabaseClient, request: OrchestratorRequest): Promise<OrchestratorResult>;

  /** Re-dispatch an existing generation's snapshot (regeneration / save prompt). */
  regenerate(client: SupabaseClient, request: RegenerateRequest): Promise<OrchestratorResult>;
}
