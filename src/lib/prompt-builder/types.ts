/**
 * Prompt Builder Foundation V1 — Shared TypeScript Models
 *
 * The Prompt Builder sits between the Snapshot Builder and the Generation
 * Engine. It accepts a BlueprintSnapshot and produces a provider-neutral
 * GenerationSnapshot — the immutable object the Generation Engine persists
 * and executes.
 *
 * The transformation has two stages:
 * 1. Extract component information from the BlueprintSnapshot into structured
 *    creative sections keyed by component type.
 * 2. Compose those sections into named prompt channels, then assemble the
 *    full GenerationSnapshot.
 *
 * Provider-specific prompt wording is NOT in this module. It is delegated to
 * pluggable PromptFormatter implementations that are registered in the
 * registry. The Prompt Builder calls the formatter to turn structured sections
 * into provider-specific prompt channels. If no formatter is registered, a
 * neutral default formatter is used.
 *
 * Golden Rule: "If Fal.ai disappears tomorrow and ZenCreator becomes active,
 * the Prompt Builder architecture must not change." Only a new formatter
 * module needs to be written and registered.
 *
 * Modality Rule: "If image generation disappears tomorrow and video becomes
 * the only modality, the Prompt Builder architecture must not change." The
 * composition is a universal section map — no modality-specific named fields.
 * The formatter output is a universal channel map — no modality-specific
 * output shape. The registry keys on provider + asset type — one provider
 * can serve multiple modalities.
 *
 * This module is:
 * - Provider independent — no hardcoded provider names, no provider-specific wording.
 * - Modality independent — no hardcoded asset types, no modality-specific fields.
 * - Immutable — the output GenerationSnapshot is frozen and never mutated.
 * - Stateless — no internal state retained between calls.
 * - Testable — pure data transformation; validation is extracted to a separate module.
 * - Reusable — any caller can build a prompt from any BlueprintSnapshot.
 *
 * It does NOT:
 * - Access the database.
 * - Call the Dispatcher, Workers, Adapters, or Providers.
 * - Generate media.
 * - Contain provider-specific prompt wording.
 * - Hardcode any modality or asset type.
 */

import type { ComponentTypeCode } from '../../types/blueprint';
import type { AssetType, GenerationSnapshot } from '../../types/generation';
import type { BlueprintSnapshot, SnapshotComponentEntry } from '../snapshot-builder/types';

// ═══════════════════════════════════════════════════════════════════════════
// Creative Section — structured extraction from a single component
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single creative section — one logical piece of the final prompt.
 * Each section corresponds to a component type (identity, body, dress, etc.)
 * and contains the raw text fragments extracted from that component's metadata.
 *
 * Sections are provider-neutral and modality-neutral. A PromptFormatter decides
 * how to combine them into named prompt channels that a specific provider's
 * API expects.
 *
 * This shape is generic enough for every AI modality: image, video, audio,
 * speech, chat, motion, and future asset types. It carries no assumptions
 * about what kind of media the prompt will produce.
 */
export interface CreativeSection {
  /** The component type this section was extracted from. */
  readonly type_code: ComponentTypeCode;
  /** Human-readable label for the section (e.g. "Identity", "Body"). */
  readonly label: string;
  /** Ordered text fragments from the component's metadata. */
  readonly fragments: readonly string[];
  /** The source component this section was built from, if any. */
  readonly component: SnapshotComponentEntry | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CreativeComposition — universal section collection keyed by component type
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The universal creative composition — a section collection keyed by
 * component type code.
 *
 * This replaces the former fixed-field PromptComposition. Instead of
 * hardcoding named fields (identity, body, dress, camera, lighting, etc.),
 * sections are stored in a map. This allows future component types to be
 * added without modifying this interface — the composition is infinitely
 * extensible.
 *
 * Each modality's formatter reads only the sections it cares about:
 * - An image formatter reads camera, lighting, pose, expression, etc.
 * - A video formatter reads scene, motion, duration-related sections.
 * - An audio formatter reads voice, tempo, narration sections.
 * - A chat formatter reads system, persona, dialogue sections.
 *
 * None of these modalities need the others' sections to exist. The map
 * simply contains whatever sections the BlueprintSnapshot's components
 * produced.
 */
export interface CreativeComposition {
  /** Section map keyed by ComponentTypeCode. */
  readonly sections: ReadonlyMap<ComponentTypeCode, CreativeSection>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Prompt Channel — universal named output channel
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single named prompt channel — one logical output of the formatter.
 *
 * Channels replace the former fixed { prompt, negativePrompt } output.
 * Each modality defines its own channel names:
 * - Image: "positive", "negative"
 * - Video: "scene", "motion"
 * - Audio: "narration", "voice_style"
 * - Chat: "system", "user"
 *
 * The channel name is a string — no modality is hardcoded in this interface.
 * The Prompt Builder does not interpret channel names; it passes them through
 * to the GenerationSnapshot.
 */
export interface PromptChannel {
  /** Channel name — modality-specific (e.g. "positive", "scene", "system"). */
  readonly name: string;
  /** The prompt text for this channel. */
  readonly text: string;
}

/**
 * The universal formatter output — a collection of named prompt channels.
 *
 * The formatter returns a map of channel name → channel text. The Prompt
 * Builder does not interpret the channel names; it assembles them into the
 * GenerationSnapshot. The GenerationSnapshot's `prompt` field receives the
 * primary channel (convention: the first channel), and additional channels
 * are stored in `providerMetadata.promptChannels` for downstream consumption.
 */
export interface PromptChannelOutput {
  readonly channels: ReadonlyMap<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Extracted Context — domain-specific data pulled from component metadata
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Identity data extracted from an identity component's metadata.
 * These fields populate GenerationSnapshot.identityContext.
 */
export interface ExtractedIdentityContext {
  readonly identityId?: string;
  readonly identityCode?: string;
  readonly aprCode?: string;
  readonly aprName?: string;
  readonly btCode?: string;
  readonly btName?: string;
}

export interface ExtractedDressContext {
  readonly dressId?: string;
  readonly dressCode?: string;
  readonly dressName?: string;
  readonly dressDescription?: string;
  readonly dressPromptFragment?: string;
}

export interface ExtractedAccessoryContext {
  readonly accessoryId?: string;
  readonly accessoryCode: string;
  readonly accessoryName: string;
}

export interface ExtractedRoleContext {
  readonly roleBlueprintId?: string;
  readonly roleCode?: string;
  readonly roleName?: string;
  readonly environment?: Record<string, string>;
  readonly camera?: Record<string, string>;
  readonly pose?: Record<string, string>;
  readonly expression?: Record<string, string>;
}

export interface ExtractedSceneContext {
  readonly imageCode?: string;
  readonly phase?: string;
  readonly sequence?: number;
  readonly sceneOverride?: Record<string, unknown>;
}

/**
 * All domain-specific context extracted from the BlueprintSnapshot's
 * components. This is the bridge between generic component metadata and
 * the typed sub-objects on GenerationSnapshot.
 *
 * Note: These typed contexts exist because GenerationSnapshot (frozen in the
 * Generation Engine) defines typed sub-objects. The Prompt Builder populates
 * them from component metadata but does not assume any modality — fields that
 * don't exist for a given asset type are simply undefined.
 */
export interface ExtractedContext {
  readonly identity?: ExtractedIdentityContext;
  readonly dress?: ExtractedDressContext;
  readonly accessories?: readonly ExtractedAccessoryContext[];
  readonly role?: ExtractedRoleContext;
  readonly scene?: ExtractedSceneContext;
}

// ═══════════════════════════════════════════════════════════════════════════
// Formatter Contract — pluggable provider-specific prompt formatting
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The contract for a provider- and modality-specific prompt formatter.
 *
 * A formatter takes the provider-neutral CreativeComposition and produces
 * a set of named prompt channels tailored to a specific provider's API
 * expectations for a specific asset type.
 *
 * The formatter contains ALL provider-specific and modality-specific wording.
 * The Prompt Builder itself never hardcodes provider names, formatting
 * conventions, or channel names.
 *
 * To add a new provider or modality: implement this interface and register
 * it in the PromptFormatterRegistry. The Prompt Builder architecture does
 * not change.
 */
export interface PromptFormatter {
  /** Provider identifier — must match provider_configurations.provider_name. */
  readonly providerName: string;
  /** Asset type this formatter handles — e.g. "image", "video", "audio", "text". */
  readonly assetType: AssetType;
  /** Formatter version — recorded in the snapshot for auditability. */
  readonly version: string;
  /**
   * Format the creative composition into provider-specific prompt channels.
   * @returns A map of channel name → channel text.
   */
  format(composition: CreativeComposition): PromptChannelOutput;
}

// ═══════════════════════════════════════════════════════════════════════════
// Builder Input
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Request to build a GenerationSnapshot from a BlueprintSnapshot.
 *
 * `formatter` is optional — if omitted, a neutral default formatter is used.
 * `providerName` is optional — recorded in the snapshot for auditability.
 * `providerParameters` are passed through to the GenerationSnapshot as-is;
 * the Prompt Builder does not interpret or validate them.
 * `inputAssets` is a generic map — no modality-specific asset URLs are assumed.
 */
export interface PromptBuildRequest {
  /** The BlueprintSnapshot from the Snapshot Builder. */
  readonly snapshot: BlueprintSnapshot;
  /** Optional provider-specific formatter. If null, the neutral default is used. */
  readonly formatter?: PromptFormatter;
  /** Provider name for auditability (stored in snapshot.promptBuilderName). */
  readonly providerName?: string;
  /** Provider parameters passed through to the GenerationSnapshot. */
  readonly providerParameters?: Record<string, unknown>;
  /** Optional input asset URLs, keyed by generic name (no modality assumption). */
  readonly inputAssets?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation Layer
// ═══════════════════════════════════════════════════════════════════════════

export type PromptValidationSeverity = 'error' | 'warning';

export interface PromptValidationIssue {
  code: PromptValidationIssueCode;
  message: string;
  severity: PromptValidationSeverity;
  component_type_code?: ComponentTypeCode;
}

export type PromptValidationIssueCode =
  | 'snapshot_invalid'
  | 'no_components'
  | 'no_sections'
  | 'empty_prompt'
  | 'no_channels'
  | 'formatter_missing'
  | 'formatter_name_mismatch';

export interface PromptValidationResult {
  valid: boolean;
  issues: readonly PromptValidationIssue[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Builder Result — discriminated union for error handling
// ═══════════════════════════════════════════════════════════════════════════

export type PromptBuilderErrorCode =
  | 'validation_failed'
  | 'extraction_failed'
  | 'format_failed';

export interface PromptBuilderError {
  code: PromptBuilderErrorCode;
  message: string;
  issues?: readonly PromptValidationIssue[];
}

export type PromptBuilderResult =
  | { readonly ok: true; readonly snapshot: GenerationSnapshot }
  | { readonly ok: false; readonly error: PromptBuilderError };

// ═══════════════════════════════════════════════════════════════════════════
// Builder Interface — for testability and dependency injection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The contract for a Prompt Builder implementation.
 *
 * Stateless: the same input always produces the same output. No internal
 * state is retained.
 *
 * Provider-independent: provider-specific wording is delegated to the
 * pluggable PromptFormatter.
 *
 * Modality-independent: the composition is a universal section map and the
 * formatter output is a universal channel map — no modality is hardcoded.
 */
export interface PromptBuilder {
  /**
   * Build a GenerationSnapshot from a BlueprintSnapshot.
   *
   * Steps:
   * 1. Validate the BlueprintSnapshot.
   * 2. Extract component information into creative sections.
   * 3. Extract domain-specific context (identity, dress, role, etc.).
   * 4. Format the composition using the provided or default formatter.
   * 5. Validate prompt completeness.
   * 6. Assemble the immutable GenerationSnapshot.
   * 7. Return it.
   */
  build(request: PromptBuildRequest): PromptBuilderResult;
}
