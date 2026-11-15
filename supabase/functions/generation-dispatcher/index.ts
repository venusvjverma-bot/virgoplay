import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  createGeneration,
  GenerationLifecycle,
  getLatestVersion,
} from "../_shared/generation-lifecycle.ts";
import { loadProviderConfig } from "../_shared/generation-provider.ts";
import {
  assetTypeToServiceType,
  type AssetType,
  type AssetSubtype,
  type BusinessRefType,
  type DispatchRequest,
  type GenerationRequest,
  type GenerationSnapshot,
  type GenerationResponse,
  type ProviderConfig,
  type ProviderServiceType,
} from "../_shared/generation-types.ts";
import { getWorker, registerWorker, type WorkerInput, type WorkerResult } from "../_shared/worker-contract.ts";
import { imageWorker } from "../_shared/image-worker.ts";

// Register workers at module load. Each worker handles one asset type.
// Adding a new worker = implement GenerationWorker + register here.
registerWorker("image", imageWorker);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ═══════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════

const VALID_ASSET_TYPES: ReadonlySet<string> = new Set([
  "image", "video", "audio", "text", "face_swap",
]);

const VALID_ASSET_SUBTYPES: ReadonlySet<string> = new Set([
  "character_identity", "role_image", "storyboard_image", "uniform",
  "appearance_preset", "body_type_preset", "dialogue", "scene", "future",
]);

const VALID_BUSINESS_REF_TYPES: ReadonlySet<string> = new Set([
  "master_ai_identities", "role_image_library", "engine_image_packages",
  "engine_image_package_variants", "engine_appearance_preset_assets",
  "engine_body_type_preset_assets", "ai_dress_library", "ai_accessory_library",
  "creator_uniform_library", "generated_images", "master_ai_characters",
  "ai_identity_layers", "dialogue_packages",
]);

interface ValidationError {
  field: string;
  message: string;
}

function validateRequest(body: DispatchRequest): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!body.asset_type || !VALID_ASSET_TYPES.has(body.asset_type)) {
    errors.push({ field: "asset_type", message: `Invalid asset_type. Must be one of: ${[...VALID_ASSET_TYPES].join(", ")}` });
  }
  if (!body.asset_subtype || !VALID_ASSET_SUBTYPES.has(body.asset_subtype)) {
    errors.push({ field: "asset_subtype", message: `Invalid asset_subtype. Must be one of: ${[...VALID_ASSET_SUBTYPES].join(", ")}` });
  }
  if (body.business_ref_type && !VALID_BUSINESS_REF_TYPES.has(body.business_ref_type)) {
    errors.push({ field: "business_ref_type", message: `Invalid business_ref_type. Must be one of: ${[...VALID_BUSINESS_REF_TYPES].join(", ")}` });
  }
  if (body.business_ref_type && !body.business_ref_id) {
    errors.push({ field: "business_ref_id", message: "business_ref_id is required when business_ref_type is provided" });
  }
  if (!body.snapshot && !body.context) {
    errors.push({ field: "context", message: "Either 'snapshot' or 'context' must be provided" });
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════
// Snapshot Construction
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build an immutable GenerationSnapshot from the request context.
 *
 * The Dispatcher does NOT resolve business data here — it simply copies
 * the context fields the caller provided into the snapshot structure.
 * Business-data resolution (APR, BT, dress, role, blueprint, prompt building)
 * happens BEFORE the dispatcher is called, in the caller or a pre-dispatch
 * step. The snapshot is the frozen input the worker executes against.
 */
function buildSnapshot(req: DispatchRequest): GenerationSnapshot {
  if (req.snapshot) {
    return {
      ...req.snapshot,
      providerParameters: {
        ...req.snapshot.providerParameters,
        ...(req.provider_parameters ?? {}),
      },
    };
  }

  const ctx = req.context!;

  const snapshot: GenerationSnapshot = {
    prompt: "",
    providerParameters: {
      ...req.provider_parameters,
    },
  };

  if (ctx.identity_code || ctx.master_ai_identity_id) {
    snapshot.identityContext = {
      identityId: ctx.master_ai_identity_id,
      identityCode: ctx.identity_code,
      aprCode: ctx.apr_code,
      btCode: ctx.bt_code,
    };
  }

  if (ctx.dress_code) {
    snapshot.dressContext = {
      dressCode: ctx.dress_code,
    };
  }

  if (ctx.accessory_codes && ctx.accessory_codes.length > 0) {
    snapshot.accessoryContext = ctx.accessory_codes.map((code) => ({
      accessoryCode: code,
      accessoryName: code,
    }));
  }

  if (ctx.role_code || ctx.role_blueprint_id) {
    snapshot.roleContext = {
      roleBlueprintId: ctx.role_blueprint_id,
      roleCode: ctx.role_code,
    };
  }

  if (ctx.image_code || ctx.phase || ctx.sequence !== undefined) {
    snapshot.sceneContext = {
      imageCode: ctx.image_code,
      phase: ctx.phase,
      sequence: ctx.sequence,
      sceneOverride: ctx.scene_override as Record<string, unknown> | undefined,
    };
  }

  if (ctx.reference_image_url) {
    snapshot.inputAssets = {
      referenceImageUrl: ctx.reference_image_url,
    };
  }

  if (ctx.scene_override?.negative_prompt) {
    snapshot.negativePrompt = ctx.scene_override.negative_prompt;
  }

  if (ctx.scene_override?.style) {
    snapshot.providerParameters.style = ctx.scene_override.style;
  }

  if (ctx.character_id) {
    snapshot.providerMetadata = {
      characterId: ctx.character_id,
    };
  }

  return snapshot;
}

// ═══════════════════════════════════════════════════════════════════════════
// Provider Resolution
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve the provider configuration for a given asset type.
 * The Dispatcher uses the asset type → service type mapping to load the
 * correct provider. This is fully generic — no provider name is hardcoded.
 *
 * If the caller specified a provider_id in the snapshot's providerMetadata,
 * that would take priority (future enhancement). For now, the active provider
 * for the service type is used.
 */
async function resolveProvider(assetType: AssetType): Promise<ProviderConfig | null> {
  const serviceType: ProviderServiceType = assetTypeToServiceType(assetType);
  return loadProviderConfig(serviceType);
}

// ═══════════════════════════════════════════════════════════════════════════
// Worker Routing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Route the generation to the appropriate worker based on asset type.
 * Workers are registered in the WORKER_REGISTRY (see worker-contract.ts).
 *
 * If no worker is registered for the asset type, the generation is marked
 * as failed with a clear error message.
 */
async function routeToWorker(
  lifecycle: GenerationLifecycle,
  input: WorkerInput,
  assetType: AssetType,
): Promise<WorkerResult> {
  const worker = getWorker(assetType);
  if (!worker) {
    await lifecycle.fail(
      "validation",
      `No worker registered for asset type "${assetType}". ` +
        `Register a worker in WORKER_REGISTRY before dispatching this asset type.`,
    );
    return {
      status: "failed",
      error: `No worker registered for asset type "${assetType}"`,
    };
  }
  return worker.execute(input);
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Handler
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const respond = (data: unknown, status = 200): Response =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userDb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userDb.auth.getUser();
    if (authErr || !user) return respond({ error: "Unauthorized" }, 401);

    const creatorId = user.id;

    // ── Parse & Validate ──────────────────────────────────────────────────
    const body = await req.json() as DispatchRequest;
    const errors = validateRequest(body);
    if (errors.length > 0) {
      return respond({ error: "Validation failed", validation_errors: errors }, 400);
    }

    const assetType = body.asset_type as AssetType;
    const assetSubtype = body.asset_subtype as AssetSubtype;
    const businessRefType = body.business_ref_type as BusinessRefType | undefined;

    // ── Resolve Provider ──────────────────────────────────────────────────
    const providerConfig = await resolveProvider(assetType);
    if (!providerConfig) {
      return respond({
        error: `No active provider configured for service type "${assetTypeToServiceType(assetType)}". ` +
          `Configure a provider on the Provider Configuration page.`,
      }, 422);
    }

    // ── Build Immutable Snapshot ──────────────────────────────────────────
    const snapshot = buildSnapshot(body);

    // ── Determine Version (for regenerations) ─────────────────────────────
    let version = 1;
    let parentGenerationId: string | undefined;

    if (body.context?.parent_generation_id) {
      parentGenerationId = body.context.parent_generation_id;
      const admin = createClient(supabaseUrl, serviceKey);
      const latest = await getLatestVersion(
        admin,
        businessRefType ?? "",
        body.business_ref_id ?? "",
      );
      version = latest + 1;
    }

    // ── Create Generation Record ──────────────────────────────────────────
    const admin = createClient(supabaseUrl, serviceKey);
    const generationId = await createGeneration(admin, {
      creator_id: creatorId,
      asset_type: assetType,
      asset_subtype: assetSubtype,
      business_ref_type: businessRefType,
      business_ref_id: body.business_ref_id,
      provider_id: providerConfig.id,
      provider_name: providerConfig.provider_name,
      provider_model: providerConfig.generation_endpoint || undefined,
      snapshot: snapshot as Record<string, unknown>,
      version,
      parent_generation_id: parentGenerationId,
    });

    if (!generationId) {
      return respond({ error: "Failed to create generation record" }, 500);
    }

    // ── Initialize Lifecycle ──────────────────────────────────────────────
    const lifecycle = new GenerationLifecycle(admin, generationId);
    await lifecycle.load();

    // ── Route to Worker ───────────────────────────────────────────────────
    const workerInput: WorkerInput = {
      generationId,
      snapshot,
      providerConfig,
    };

    const result = await routeToWorker(lifecycle, workerInput, assetType);

    // ── Build Response ─────────────────────────────────────────────────────
    const response: GenerationResponse = {
      generation_id: generationId,
      status: result.status === "completed" ? "completed" : result.status === "processing" ? "processing" : "failed",
      output_url: result.outputUrl,
      output_data: result.outputData,
      provider_generation_id: result.providerGenerationId,
      version,
      ...(result.status === "failed" ? {
        error: result.error,
        error_details: result.errorDetails,
      } : {}),
    };

    return respond(response);

  } catch (e) {
    const msg = (e as Error).message;
    console.error("[generation-dispatcher] Unhandled error:", msg);
    return respond({ error: "Internal dispatcher error", detail: msg }, 500);
  }
});
