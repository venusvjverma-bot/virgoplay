/**
 * Prompt Builder Foundation V1 — Core Service
 *
 * The Prompt Builder sits between the Snapshot Builder and the Generation
 * Engine. It accepts a BlueprintSnapshot and produces a provider-neutral
 * GenerationSnapshot.
 *
 * Flow:
 * 1. Validate the BlueprintSnapshot.
 * 2. Extract component information into creative sections.
 * 3. Extract domain-specific context (identity, dress, role, etc.).
 * 4. Format the composition using the provided or default formatter.
 * 5. Validate prompt completeness.
 * 6. Assemble the immutable GenerationSnapshot.
 * 7. Return it.
 *
 * It does NOT:
 * - Access the database.
 * - Call the Dispatcher, Workers, Adapters, or Providers.
 * - Generate media.
 * - Contain provider-specific prompt wording (that lives in PromptFormatter
 *   implementations).
 * - Hardcode any modality or asset type.
 * - Modify any frozen foundation.
 */

import type { ComponentTypeCode } from '../../types/blueprint';
import type { GenerationSnapshot } from '../../types/generation';
import type { BlueprintSnapshot, SnapshotComponentEntry } from '../snapshot-builder/types';
import type {
  CreativeComposition,
  CreativeSection,
  ExtractedAccessoryContext,
  ExtractedContext,
  ExtractedDressContext,
  ExtractedIdentityContext,
  ExtractedRoleContext,
  ExtractedSceneContext,
  PromptBuildRequest,
  PromptBuilderResult,
  PromptChannelOutput,
} from './types';
import { validatePromptCompleteness, validateSnapshotForPrompt } from './validation';
import { defaultPromptFormatter } from './formatter';

// ═══════════════════════════════════════════════════════════════════════════
// Component lookup — find components by type in the snapshot
// ═══════════════════════════════════════════════════════════════════════════

function findComponentByType(
  snapshot: BlueprintSnapshot,
  typeCode: ComponentTypeCode,
): SnapshotComponentEntry | null {
  return snapshot.components.find(c => c.type_code === typeCode) ?? null;
}

function findAllByType(
  snapshot: BlueprintSnapshot,
  typeCode: ComponentTypeCode,
): readonly SnapshotComponentEntry[] {
  return snapshot.components.filter(c => c.type_code === typeCode);
}

// ═══════════════════════════════════════════════════════════════════════════
// Section extraction — turn a component's metadata into a CreativeSection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract text fragments from a component's metadata.
 * Metadata values that are strings become fragments directly. Numbers and
 * booleans are stringified. Nested objects and arrays are skipped — they are
 * not prompt fragments.
 */
function extractFragments(component: SnapshotComponentEntry): string[] {
  const fragments: string[] = [];

  const meta = component.metadata as Record<string, unknown>;
  const refMeta = component.reference_metadata as Record<string, unknown>;

  // Reference metadata takes priority — it overrides component metadata
  const merged: Record<string, unknown> = { ...meta, ...refMeta };

  for (const [, value] of Object.entries(merged)) {
    if (typeof value === 'string' && value.trim() !== '') {
      fragments.push(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      fragments.push(String(value));
    }
    // Objects and arrays are not prompt fragments — they carry structured
    // context that is extracted separately by the context extractors.
  }

  // If no metadata fragments were found, use the component's description
  if (fragments.length === 0 && component.description) {
    fragments.push(component.description);
  }

  return fragments;
}

/**
 * Build a single creative section from a component.
 * Returns null if the component is null or yielded no fragments.
 */
function buildSection(
  component: SnapshotComponentEntry | null,
  typeCode: ComponentTypeCode,
  label: string,
): CreativeSection | null {
  if (!component) return null;

  const fragments = extractFragments(component);
  if (fragments.length === 0) return null;

  return Object.freeze({
    type_code: typeCode,
    label,
    fragments: Object.freeze(fragments),
    component,
  });
}

/**
 * Extract all creative sections from the BlueprintSnapshot into a universal
 * section map keyed by component type code.
 *
 * This is modality-neutral: it does not assume any specific set of component
 * types. Every component in the snapshot becomes a section in the map.
 * Formatters read only the sections relevant to their modality.
 */
function extractComposition(snapshot: BlueprintSnapshot): CreativeComposition {
  const sections = new Map<ComponentTypeCode, CreativeSection>();

  for (const component of snapshot.components) {
    const section = buildSection(component, component.type_code, component.type_label);
    if (section) {
      sections.set(component.type_code, section);
    }
  }

  return Object.freeze({ sections: Object.freeze(sections) }) as CreativeComposition;
}

// ═══════════════════════════════════════════════════════════════════════════
// Context extraction — pull domain-specific data from component metadata
// ═══════════════════════════════════════════════════════════════════════════

function extractIdentityContext(component: SnapshotComponentEntry | null): ExtractedIdentityContext | undefined {
  if (!component) return undefined;
  const meta = component.metadata as Record<string, unknown>;
  const refMeta = component.reference_metadata as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...meta, ...refMeta };

  const ctx: ExtractedIdentityContext = {
    identityId: typeof merged.identity_id === 'string' ? merged.identity_id : undefined,
    identityCode: typeof merged.identity_code === 'string' ? merged.identity_code : undefined,
    aprCode: typeof merged.apr_code === 'string' ? merged.apr_code : undefined,
    aprName: typeof merged.apr_name === 'string' ? merged.apr_name : undefined,
    btCode: typeof merged.bt_code === 'string' ? merged.bt_code : undefined,
    btName: typeof merged.bt_name === 'string' ? merged.bt_name : undefined,
  };

  const hasAny = ctx.identityId || ctx.identityCode || ctx.aprCode || ctx.aprName || ctx.btCode || ctx.btName;
  return hasAny ? Object.freeze(ctx) : undefined;
}

function extractDressContext(component: SnapshotComponentEntry | null): ExtractedDressContext | undefined {
  if (!component) return undefined;
  const meta = component.metadata as Record<string, unknown>;
  const refMeta = component.reference_metadata as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...meta, ...refMeta };

  const ctx: ExtractedDressContext = {
    dressId: typeof merged.dress_id === 'string' ? merged.dress_id : undefined,
    dressCode: typeof merged.dress_code === 'string' ? merged.dress_code : undefined,
    dressName: typeof merged.dress_name === 'string' ? merged.dress_name : undefined,
    dressDescription: typeof merged.dress_description === 'string' ? merged.dress_description : undefined,
    dressPromptFragment: typeof merged.dress_prompt_fragment === 'string' ? merged.dress_prompt_fragment : undefined,
  };

  const hasAny = ctx.dressId || ctx.dressCode || ctx.dressName || ctx.dressDescription || ctx.dressPromptFragment;
  return hasAny ? Object.freeze(ctx) : undefined;
}

function extractAccessoryContext(components: readonly SnapshotComponentEntry[]): readonly ExtractedAccessoryContext[] | undefined {
  if (components.length === 0) return undefined;

  const accessories: ExtractedAccessoryContext[] = [];
  for (const c of components) {
    const meta = c.metadata as Record<string, unknown>;
    const refMeta = c.reference_metadata as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...meta, ...refMeta };

    const code = typeof merged.accessory_code === 'string' ? merged.accessory_code : c.code;
    const name = typeof merged.accessory_name === 'string' ? merged.accessory_name : c.name;
    const id = typeof merged.accessory_id === 'string' ? merged.accessory_id : undefined;

    accessories.push(Object.freeze({ accessoryId: id, accessoryCode: code, accessoryName: name }));
  }

  return Object.freeze(accessories);
}

function extractRoleContext(
  roleComponent: SnapshotComponentEntry | null,
  environmentComponent: SnapshotComponentEntry | null,
  cameraComponent: SnapshotComponentEntry | null,
  poseComponent: SnapshotComponentEntry | null,
  expressionComponent: SnapshotComponentEntry | null,
): ExtractedRoleContext | undefined {
  if (!roleComponent) return undefined;
  const meta = roleComponent.metadata as Record<string, unknown>;
  const refMeta = roleComponent.reference_metadata as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...meta, ...refMeta };

  const environment = extractStringMap(environmentComponent);
  const camera = extractStringMap(cameraComponent);
  const pose = extractStringMap(poseComponent);
  const expression = extractStringMap(expressionComponent);

  const ctx: ExtractedRoleContext = {
    roleBlueprintId: typeof merged.role_blueprint_id === 'string' ? merged.role_blueprint_id : undefined,
    roleCode: typeof merged.role_code === 'string' ? merged.role_code : undefined,
    roleName: typeof merged.role_name === 'string' ? merged.role_name : undefined,
    environment,
    camera,
    pose,
    expression,
  };

  const hasAny = ctx.roleBlueprintId || ctx.roleCode || ctx.roleName ||
    ctx.environment || ctx.camera || ctx.pose || ctx.expression;
  return hasAny ? Object.freeze(ctx) : undefined;
}

function extractSceneContext(snapshot: BlueprintSnapshot): ExtractedSceneContext | undefined {
  const pkgMeta = snapshot.blueprint as unknown as Record<string, unknown>;
  const sceneComponent = findComponentByType(snapshot, 'environment');

  const source = sceneComponent
    ? { ...(sceneComponent.metadata as Record<string, unknown>), ...(sceneComponent.reference_metadata as Record<string, unknown>) }
    : (pkgMeta as Record<string, unknown>);

  const sceneOverride = source.scene_override && typeof source.scene_override === 'object'
    ? Object.freeze({ ...(source.scene_override as Record<string, unknown>) })
    : undefined;

  const ctx: ExtractedSceneContext = {
    imageCode: typeof source.image_code === 'string' ? source.image_code : undefined,
    phase: typeof source.phase === 'string' ? source.phase : undefined,
    sequence: typeof source.sequence === 'number' ? source.sequence : undefined,
    sceneOverride,
  };

  const hasAny = ctx.imageCode || ctx.phase || ctx.sequence !== undefined || ctx.sceneOverride;
  return hasAny ? Object.freeze(ctx) : undefined;
}

function extractStringMap(component: SnapshotComponentEntry | null): Record<string, string> | undefined {
  if (!component) return undefined;
  const meta = component.metadata as Record<string, unknown>;
  const refMeta = component.reference_metadata as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...meta, ...refMeta };

  const map: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value === 'string') {
      map[key] = value;
    }
  }

  return Object.keys(map).length > 0 ? Object.freeze(map) : undefined;
}

function extractContext(snapshot: BlueprintSnapshot): ExtractedContext {
  const identity = findComponentByType(snapshot, 'identity');
  const dress = findComponentByType(snapshot, 'dress');
  const accessories = findAllByType(snapshot, 'accessory');
  const role = findComponentByType(snapshot, 'role');
  const environment = findComponentByType(snapshot, 'environment');
  const camera = findComponentByType(snapshot, 'camera');
  const pose = findComponentByType(snapshot, 'pose');
  const expression = findComponentByType(snapshot, 'expression');

  return Object.freeze({
    identity: extractIdentityContext(identity),
    dress: extractDressContext(dress),
    accessories: extractAccessoryContext(accessories),
    role: extractRoleContext(role, environment, camera, pose, expression),
    scene: extractSceneContext(snapshot),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Channel resolution — extract primary prompt and secondary channels
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve the formatter output channels into the GenerationSnapshot's
 * prompt fields.
 *
 * Convention:
 * - The first channel (by insertion order) becomes the primary `prompt`.
 * - A channel named "negative" (case-insensitive) becomes `negativePrompt`.
 * - All channels (including primary and negative) are stored in
 *   `providerMetadata.promptChannels` for downstream consumers that need
 *   modality-specific channel access.
 *
 * This convention is modality-neutral: it does not assume which channels
 * any particular formatter produces. It uses a simple, deterministic rule
 * to map channels to the frozen GenerationSnapshot's fields.
 */
function resolveChannels(
  output: PromptChannelOutput,
): {
  prompt: string;
  negativePrompt: string | undefined;
  allChannels: Record<string, string>;
} {
  const allChannels: Record<string, string> = {};
  let prompt = '';
  let negativePrompt: string | undefined;

  let isFirst = true;
  for (const [name, text] of output.channels) {
    allChannels[name] = text;

    if (isFirst) {
      prompt = text;
      isFirst = false;
    }

    if (name.toLowerCase() === 'negative') {
      negativePrompt = text;
    }
  }

  // If only a "negative" channel exists, use it as the prompt too
  if (!prompt && negativePrompt) {
    prompt = negativePrompt;
  }

  return { prompt, negativePrompt, allChannels };
}

// ═══════════════════════════════════════════════════════════════════════════
// Snapshot assembly — build the immutable GenerationSnapshot
// ═══════════════════════════════════════════════════════════════════════════

function assembleGenerationSnapshot(
  prompt: string,
  negativePrompt: string | undefined,
  formatterName: string,
  formatterVersion: string,
  allChannels: Record<string, string>,
  context: ExtractedContext,
  request: PromptBuildRequest,
): GenerationSnapshot {
  const providerMetadata: Record<string, unknown> = {
    promptChannels: Object.freeze(allChannels),
  };

  // Merge any caller-supplied providerMetadata
  const callerMeta = request.providerParameters?.providerMetadata;
  if (callerMeta && typeof callerMeta === 'object') {
    Object.assign(providerMetadata, callerMeta as Record<string, unknown>);
  }

  const providerParameters = Object.freeze({
    ...(request.providerParameters ?? {}),
    providerMetadata: Object.freeze(providerMetadata),
  }) as Record<string, unknown>;

  const snapshot: GenerationSnapshot = {
    prompt,
    negativePrompt,
    promptBuilderName: formatterName,
    promptBuilderVersion: formatterVersion,

    inputAssets: request.inputAssets as GenerationSnapshot['inputAssets'],

    identityContext: context.identity,
    dressContext: context.dress,
    accessoryContext: context.accessories as ExtractedAccessoryContext[] | undefined,
    roleContext: context.role,
    sceneContext: context.scene,

    providerParameters,

    renderTechnique: request.snapshot.generation.render_technique,
  };

  return Object.freeze(snapshot);
}

// ═══════════════════════════════════════════════════════════════════════════
// Public builder — the single entry point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a GenerationSnapshot from a BlueprintSnapshot.
 *
 * @param request - Contains the BlueprintSnapshot, optional formatter, and
 *                  pass-through provider parameters.
 * @returns Discriminated union: { ok: true, snapshot } or { ok: false, error }
 *
 * @example
 * const result = buildGenerationSnapshot({
 *   snapshot: blueprintSnapshot,
 *   formatter: myFormatter,
 *   providerName: 'Promptchan',
 *   providerParameters: { imageSize: '1024x1024', seed: 42 },
 * });
 * if (result.ok) {
 *   console.log(result.snapshot.prompt);
 * } else {
 *   console.error(result.error.message);
 * }
 */
export function buildGenerationSnapshot(request: PromptBuildRequest): PromptBuilderResult {
  const { snapshot, formatter, providerName, providerParameters, inputAssets } = request;

  // ── Step 1: Validate the BlueprintSnapshot ─────────────────────────────
  const preValidation = validateSnapshotForPrompt(snapshot);
  if (!preValidation.valid) {
    return {
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'BlueprintSnapshot failed pre-extraction validation.',
        issues: preValidation.issues,
      },
    };
  }

  // ── Step 2: Extract creative sections ───────────────────────────────────
  const composition = extractComposition(snapshot);

  // ── Step 3: Extract domain-specific context ────────────────────────────
  const context = extractContext(snapshot);

  // ── Step 4: Format the composition into prompt channels ────────────────
  const activeFormatter = formatter ?? defaultPromptFormatter;
  let formatterOutput: PromptChannelOutput;
  try {
    formatterOutput = activeFormatter.format(composition);
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'format_failed',
        message: `Prompt formatter threw an error: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }

  // ── Step 5: Validate prompt completeness ──────────────────────────────
  const postValidation = validatePromptCompleteness(formatterOutput, composition);
  if (!postValidation.valid) {
    return {
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'Prompt failed post-format completeness validation.',
        issues: postValidation.issues,
      },
    };
  }

  // ── Step 6: Resolve channels and assemble the GenerationSnapshot ───────
  const { prompt, negativePrompt, allChannels } = resolveChannels(formatterOutput);

  const generationSnapshot = assembleGenerationSnapshot(
    prompt,
    negativePrompt,
    activeFormatter.providerName,
    activeFormatter.version,
    allChannels,
    context,
    request,
  );

  // ── Step 7: Return ─────────────────────────────────────────────────────
  return { ok: true, snapshot: generationSnapshot };
}
