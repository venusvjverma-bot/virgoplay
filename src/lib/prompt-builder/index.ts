/**
 * Prompt Builder Foundation V1 — Barrel Export
 *
 * Single import point for all Prompt Builder consumers.
 *
 * Usage:
 *   import { buildGenerationSnapshot, type PromptFormatter } from '@/lib/prompt-builder';
 *
 * The Prompt Builder is provider-independent, modality-independent, stateless,
 * and immutable. It transforms a BlueprintSnapshot into a GenerationSnapshot
 * — nothing more.
 *
 * Provider-specific wording lives in PromptFormatter implementations that are
 * registered in the formatter registry, keyed by provider + asset type.
 */

export { buildGenerationSnapshot } from './builder';
export {
  validateSnapshotForPrompt,
  validatePromptCompleteness,
} from './validation';
export { defaultPromptFormatter, isDefaultFormatter } from './formatter';
export {
  registerFormatter,
  unregisterFormatter,
  resolveFormatter,
  getRegisteredProviders,
  clearRegistry,
} from './registry';

export type {
  CreativeSection,
  CreativeComposition,
  PromptChannel,
  PromptChannelOutput,
  ExtractedIdentityContext,
  ExtractedDressContext,
  ExtractedAccessoryContext,
  ExtractedRoleContext,
  ExtractedSceneContext,
  ExtractedContext,
  PromptFormatter,
  PromptBuildRequest,
  PromptValidationSeverity,
  PromptValidationIssue,
  PromptValidationIssueCode,
  PromptValidationResult,
  PromptBuilderErrorCode,
  PromptBuilderError,
  PromptBuilderResult,
  PromptBuilder,
} from './types';
