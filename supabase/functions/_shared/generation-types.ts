/**
 * Universal Generation Engine V2 — Shared Type Definitions (Deno/Edge Function copy)
 *
 * This file is the Deno-compatible copy of src/types/generation.ts.
 * Edge functions import from this file; the frontend imports from src/types/generation.ts.
 * The two files MUST be kept in sync.
 *
 * Differences from the frontend version:
 * - Uses `jsr:` and `npm:` import style (none needed here — pure types)
 * - No React/Vite dependencies
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

export type ProviderMode = 'sync' | 'async';

export type ProviderServiceType = 'image' | 'text' | 'video' | 'audio';

export type ProviderAuthMethod = 'bearer' | 'key' | 'x-api-key' | 'none';

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
  // ── Atlas Cloud (Seedream T2I) ───────────────────────────────────────────
  atlas_size?: string;
  atlas_output_format?: string;
  atlas_thinking?: string;
  atlas_prompt_optimization_mode?: string;
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

export interface TextProviderAdapter {
  readonly providerName: string;
  readonly providerMode: ProviderMode;
  generateText(params: TextGenerationParams): Promise<ProviderResult>;
}

// ── Provider Result ──────────────────────────────────────────────────────────

export interface ProviderResult {
  status: 'completed' | 'processing' | 'failed';
  outputUrl?: string;
  outputData?: string;
  outputBase64?: string;
  providerGenerationId?: string;
  progress?: number;
  error?: string;
  errorDetails?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Immutable Generation Snapshot
// ═══════════════════════════════════════════════════════════════════════════

export interface GenerationSnapshot {
  prompt: string;
  negativePrompt?: string;
  promptBuilderName?: string;
  promptBuilderVersion?: string;

  inputAssets?: {
    referenceImageUrl?: string;
    faceImageUrl?: string;
    bodyImageUrl?: string;
    garmentImageUrl?: string;
    imageAssets?: string[];
  };

  identityContext?: {
    identityId?: string;
    identityCode?: string;
    aprCode?: string;
    aprName?: string;
    btCode?: string;
    btName?: string;
  };

  dressContext?: {
    dressId?: string;
    dressCode?: string;
    dressName?: string;
    dressDescription?: string;
    dressPromptFragment?: string;
  };

  accessoryContext?: Array<{
    accessoryId?: string;
    accessoryCode: string;
    accessoryName: string;
  }>;

  roleContext?: {
    roleBlueprintId?: string;
    roleCode?: string;
    roleName?: string;
    environment?: Record<string, string>;
    camera?: Record<string, string>;
    pose?: Record<string, string>;
    expression?: Record<string, string>;
  };

  sceneContext?: {
    imageCode?: string;
    phase?: string;
    sequence?: number;
    sceneOverride?: Record<string, unknown>;
  };

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

  renderTechnique?: string;
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
// Generation Request / Response
// ═══════════════════════════════════════════════════════════════════════════

export interface GenerationRequest {
  asset_type: AssetType;
  asset_subtype: AssetSubtype;
  business_ref_type?: BusinessRefType;
  business_ref_id?: string;
  context: GenerationRequestContext;
  provider_parameters?: Partial<GenerationSnapshot['providerParameters']>;
}

export interface GenerationRequestContext {
  master_ai_identity_id?: string;
  identity_code?: string;
  apr_code?: string;
  bt_code?: string;
  image_code?: string;
  role_code?: string;
  role_blueprint_id?: string;
  phase?: string;
  sequence?: number;
  dress_code?: string;
  accessory_codes?: string[];
  character_id?: string;
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
  reference_image_url?: string;
  force?: boolean;
  parent_generation_id?: string;
}

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
