/**
 * Generation Orchestrator — Barrel Export
 *
 * Single import point for all Orchestrator consumers.
 *
 * Usage:
 *   import { orchestrateGeneration, type OrchestratorRequest } from '@/lib/generation-orchestrator';
 *
 * The Orchestrator is the sole conductor of the Mother Creator pipeline.
 * It coordinates: Resolver → Snapshot Builder → Prompt Builder → Dispatcher.
 * It never duplicates business logic from any frozen foundation.
 */

export { orchestrateGeneration, orchestrateRegeneration } from './orchestrator';

export type {
  OrchestratorRequest,
  RegenerateRequest,
  OrchestratorResult,
  OrchestratorError,
  OrchestratorErrorCode,
  GenerationOrchestrator,
} from './types';
