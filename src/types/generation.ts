/**
 * Universal Generation Engine V2 — Shared Type Definitions
 *
 * These types define the contracts for the generation lifecycle, provider
 * adapters, and immutable snapshots. They are shared between the frontend and
 * edge functions (via duplication — edge functions import from _shared/).
 *
 * The frontend imports from this file (src/types/generation.ts).
 * Edge functions import from supabase/functions/_shared/generation-types.ts
 * which contains identical definitions.
 *
 * When updating types, update BOTH files to keep them in sync.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Asset Classification
// ═══════════════════════════════════════════════════════════════════════════

export type AssetType = 'image' | 'video' | 'audio' | 'text' | 'face_swap';

export type AssetSubtype =
  | 'character_identity'
  | 'role_image'
  | 'storyboard_image'
  | 'uniform'
  | 'appearance_preset'
  | 'body_type_preset'
  | 'dialogue'
  | 'scene'
  | 'future';

/**
 * Identifies which business table owns the generation result.
 * The business table stores a `generation_id` FK; it does NOT own media URLs.
 */
export type BusinessRefType =
  | 'master_ai_identities'
  | 'role_image_library'
  | 'engine_image_packages'
  | 'engine_image_package_variants'
  | 'engine_appearance_preset_assets'
  | 'engine_body_type_preset_assets'
  | 'ai_dress_library'
  | 'ai_accessory_library'
  | 'creator_uniform_library'
  | 'generated_images'
  | 'master_ai_characters'
  | 'ai_identity_layers'
  | 'dialogue_packages';

// ═══════════════════════════════════════════════════════════════════════════
// Generation Status Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

export type GenerationStatus =
  | 'queued'
  | 'uploading_assets'
  | 'generating'
  | 'processing'
  | 'downloading'
  | 'storing'
  | 'completed'
  | 'failed';

/**
 * Identifies which lifecycle step failed.
 * Used for diagnostics and the `failed_at_step` column.
 */
export type FailedAtStep =
  | 'validation'
  | 'upload'
  | 'provider_call'
  | 'provider_timeout'
  | 'provider_rejection'
  | 'poll'
  | 'poll_timeout'
  | 'download'
  | 'storage'
  | 'db_update';

/**
 * Ordered lifecycle stages for sequential validation and UI timeline display.
 * Each status (except terminal) maps to exactly one stage index.
 */
export const LIFECYCLE_ORDER: GenerationStatus[] = [
  'queued',
  'uploading_assets',
  'generating',
  'processing',
  'downloading',
  'storing',
  'completed',
];

export const TERMINAL_STATUSES: GenerationStatus[] = ['completed', 'failed'];

export const ACTIVE_STATUSES: GenerationStatus[] = [
  'queued',
  'uploading_assets',
  'generating',
  'processing',
  'downloading',
  'storing',
];

export function isTerminalStatus(status: GenerationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isActiveStatus(status: GenerationStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function lifecycleStageIndex(status: GenerationStatus): number {
  return LIFECYCLE_ORDER.indexOf(status);
}

// ═══════════════════════════════════════════════════════════════════════════
// Provider Interfaces
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Provider execution mode — determines whether the lifecycle includes polling.
 */
export type ProviderMode = 'sync' | 'async';

/**
 * Provider service type — matches the `service_type` column in
 * `provider_configurations`.
 */
export type ProviderServiceType = 'image' | 'text' | 'video' | 'audio';

/**
 * Authentication method — matches the `auth_method` column in
 * `provider_configurations`.
 */
export type ProviderAuthMethod = 'bearer' | 'key' | 'x-api-key' | 'none';

/**
 * Loaded provider configuration, ready for use by an adapter.
 */
export interface ProviderConfig {
  id: string;
  provider_name: string;
  provider_url: string;
  auth_method: ProviderAuthMethod;
  service_type: ProviderServiceType;
  api_key: string;
  generation_endpoint: string;
  generation_status_endpoint: string | null;
  generation_result_endpoint: string | null;
  video_generation_endpoint: string;
}

// ── Image Provider Adapter ───────────────────────────────────────────────────

export interface TextToImageParams {
  prompt: string;
  imageSize?: string | { width: number; height: number };
  numInferenceSteps?: number;
  numImages?: number;
  safetyTolerance?: string;
  outputFormat?: string;
  seed?: number;
  negativePrompt?: string;
  model?: string;
  ratio?: string;
}

export interface ImageToImageParams {
  prompt: string;
  referenceImageUrl: string;
  strength?: number;
  numInferenceSteps?: number;
  numImages?: number;
  safetyTolerance?: string;
}

export interface FaceSwapParams {
  baseImageUrl: string;
  swapImageUrl: string;
}

export interface ReduxParams {
  referenceUrl: string;
  prompt: string;
  imageSize?: string | { width: number; height: number };
  numInferenceSteps?: number;
  guidanceScale?: number;
}

export interface VirtualTryOnParams {
  humanImageUrl: string;
  garmentImageUrl: string;
  clothType?: string;
}

/**
 * Provider-agnostic image generation adapter.
 * Each provider implements this interface; the generation engine calls
 * these methods without knowing which provider is active.
 */
export interface ImageEditorParams {
  prompt: string;
  referenceImageUrl: string;
  additionalReferenceImageUrls?: string[];
  model?: string;
  ratio?: string;
  batch_size?: number;
  lora_adapter?: string;
  seed?: number;
  randomize_seed?: boolean;
  guidance_scale?: number;
  steps?: number;
  // ── Atlas Cloud (Seedream) ───────────────────────────────────────────────
  atlas_size?: string;
  atlas_output_format?: string;
  atlas_thinking?: string;
  atlas_prompt_optimization_mode?: string;
}

export interface ImageProviderAdapter {
  readonly providerName: string;
  readonly providerMode: ProviderMode;
  textToImage(params: TextToImageParams): Promise<ProviderResult>;
  imageToImage(params: ImageToImageParams): Promise<ProviderResult>;
  faceSwap(params: FaceSwapParams): Promise<ProviderResult>;
  redux(params: ReduxParams): Promise<ProviderResult>;
  virtualTryOn(params: VirtualTryOnParams): Promise<ProviderResult>;
  imageEditor(params: ImageEditorParams): Promise<ProviderResult>;
}

// ── Text Provider Adapter ───────────────────────────────────────────────────

export interface TextGenerationParams {
  prompt: string;
  maxNewTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * Provider-agnostic text generation adapter.
 */
export interface TextProviderAdapter {
  readonly providerName: string;
  readonly providerMode: ProviderMode;
  generateText(params: TextGenerationParams): Promise<ProviderResult>;
}

// ── Provider Result ──────────────────────────────────────────────────────────

/**
 * Universal result from any provider adapter method.
 *
 * - For synchronous providers: `status='completed'` with `outputUrl` or `outputData`.
 * - For async providers: `status='processing'` with `providerGenerationId`.
 * - On failure: `status='failed'` with error details.
 */
export interface ProviderResult {
  status: 'completed' | 'processing' | 'failed';
  /** URL of the generated asset (image, video) — available when status='completed' */
  outputUrl?: string;
  /** Raw text output — available when status='completed' for text generation */
  outputData?: string;
  /** Base64-encoded image data — available when provider returns inline image */
  outputBase64?: string;
  /** Provider's internal generation ID — available when status='processing' (async) */
  providerGenerationId?: string;
  /** Estimated progress percentage (0-100) during polling */
  progress?: number;
  /** Error message when status='failed' */
  error?: string;
  /** Full error response from the provider */
  errorDetails?: Record<string, unknown>;
  /** Provider-specific metadata (gems remaining, cost, etc.) */
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Immutable Generation Snapshot
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The complete, immutable request context captured at generation creation time.
 * Stored in the `generations.snapshot` jsonb column.
 *
 * This snapshot enables:
 * - Regeneration with the exact same parameters
 * - Auditing and debugging
 * - Provider migration (same snapshot, different provider)
 * - Prompt editing (new generation with modified snapshot, original preserved)
 *
 * This object is NEVER updated after the generation record is created.
 */
export interface GenerationSnapshot {
  // ── Prompt ──────────────────────────────────────────────────────────────
  prompt: string;
  negativePrompt?: string;
  promptBuilderName?: string;
  promptBuilderVersion?: string;

  // ── Input Assets ─────────────────────────────────────────────────────────
  inputAssets?: {
    referenceImageUrl?: string;
    faceImageUrl?: string;
    bodyImageUrl?: string;
    garmentImageUrl?: string;
  };

  // ── Identity Context ─────────────────────────────────────────────────────
  identityContext?: {
    identityId?: string;
    identityCode?: string;
    aprCode?: string;
    aprName?: string;
    btCode?: string;
    btName?: string;
  };

  // ── Dress Context ────────────────────────────────────────────────────────
  dressContext?: {
    dressId?: string;
    dressCode?: string;
    dressName?: string;
    dressDescription?: string;
    dressPromptFragment?: string;
  };

  // ── Accessory Context ────────────────────────────────────────────────────
  accessoryContext?: Array<{
    accessoryId?: string;
    accessoryCode: string;
    accessoryName: string;
  }>;

  // ── Role Context ─────────────────────────────────────────────────────────
  roleContext?: {
    roleBlueprintId?: string;
    roleCode?: string;
    roleName?: string;
    environment?: Record<string, string>;
    camera?: Record<string, string>;
    pose?: Record<string, string>;
    expression?: Record<string, string>;
  };

  // ── Scene Context ────────────────────────────────────────────────────────
  sceneContext?: {
    imageCode?: string;
    phase?: string;
    sequence?: number;
    sceneOverride?: Record<string, unknown>;
  };

  // ── Provider Parameters ──────────────────────────────────────────────────
  providerParameters: {
    imageSize?: string | { width: number; height: number };
    numInferenceSteps?: number;
    strength?: number;
    seed?: number;
    style?: string;
    quality?: string;
    restoreFaces?: boolean;
    creativity?: number;
    [key: string]: unknown;
  };

  // ── Render Technique ─────────────────────────────────────────────────────
  renderTechnique?: string;

  // ── Provider-specific extension point ───────────────────────────────────
  providerMetadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Database Row Types
// ═══════════════════════════════════════════════════════════════════════════

export interface GenerationRow {
  id: string;
  creator_id: string;
  asset_type: AssetType;
  asset_subtype: string | null;
  business_ref_type: string | null;
  business_ref_id: string | null;
  provider_id: string | null;
  provider_name: string;
  provider_model: string | null;
  provider_generation_id: string | null;
  snapshot: GenerationSnapshot;
  status: GenerationStatus;
  failed_at_step: string | null;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  output_storage_bucket: string | null;
  output_storage_path: string | null;
  output_public_url: string | null;
  output_metadata: Record<string, unknown> | null;
  provider_cost_units: string | null;
  provider_cost_amount: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  version: number;
  parent_generation_id: string | null;
}

export interface GenerationHistoryRow {
  id: string;
  generation_id: string;
  from_status: GenerationStatus | null;
  to_status: GenerationStatus;
  event_description: string | null;
  event_metadata: Record<string, unknown>;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Generation Request (sent by frontend to the generation edge function)
// ═══════════════════════════════════════════════════════════════════════════

export interface GenerationRequest {
  asset_type: AssetType;
  asset_subtype: AssetSubtype;
  business_ref_type?: BusinessRefType;
  business_ref_id?: string;
  context: GenerationRequestContext;
  provider_parameters?: Partial<GenerationSnapshot['providerParameters']>;
}

/**
 * Context object carrying all the information needed to build the prompt
 * and resolve input assets. The edge function uses this to construct the
 * immutable snapshot before calling the provider.
 */
export interface GenerationRequestContext {
  // Identity
  master_ai_identity_id?: string;
  identity_code?: string;
  apr_code?: string;
  bt_code?: string;

  // Role / Scene
  image_code?: string;
  role_code?: string;
  role_blueprint_id?: string;
  phase?: string;
  sequence?: number;

  // Dress / Accessories
  dress_code?: string;
  accessory_codes?: string[];

  // Character (for character image generation)
  character_id?: string;

  // Scene overrides
  scene_override?: {
    outfit?: string;
    pose?: string;
    location?: string;
    lighting?: string;
    expression?: string;
    extra_prompt?: string;
    negative_prompt?: string;
    style?: string;
  };

  // Reference image (for img2img)
  reference_image_url?: string;

  // Force regeneration even if asset exists
  force?: boolean;

  // Regeneration: parent generation to snapshot from
  parent_generation_id?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Generation Response (returned by the edge function)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Response returned immediately after creating a generation record.
 * For synchronous providers, the response may include the completed result.
 * For async providers, the response includes the generation ID for polling.
 */
export interface GenerationResponse {
  generation_id: string;
  status: GenerationStatus;
  output_url?: string;
  output_data?: string;
  error?: string;
  error_details?: Record<string, unknown>;
  provider_generation_id?: string;
  version?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Dispatch Request — the shape the Dispatcher edge function accepts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Request body accepted by the generation-dispatcher edge function.
 * The frontend sends this; the Dispatcher validates it, creates the
 * immutable snapshot, persists the generation record, and routes to a worker.
 *
 * `snapshot` is optional — the caller may supply a pre-built snapshot (e.g.
 * for regeneration) or let the Dispatcher build one from `context`.
 */
export interface DispatchRequest {
  asset_type: AssetType;
  asset_subtype: AssetSubtype;
  business_ref_type?: BusinessRefType;
  business_ref_id?: string;
  context?: GenerationRequestContext;
  snapshot?: GenerationSnapshot;
  provider_parameters?: Partial<GenerationSnapshot['providerParameters']>;
}

/**
 * Maps an asset type to the provider service type needed to execute it.
 * The Dispatcher uses this to load the correct provider configuration.
 *
 * Adding a new asset type only requires adding a mapping here — the engine
 * itself does not hardcode any provider.
 */
export function assetTypeToServiceType(assetType: AssetType): ProviderServiceType {
  switch (assetType) {
    case 'image':
    case 'face_swap':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'text':
      return 'text';
    default:
      return 'image';
  }
}
