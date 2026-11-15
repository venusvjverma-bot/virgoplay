/**
 * Image Worker — Universal Generation Engine V2
 *
 * Stateless worker that executes image generations. It receives an immutable
 * Generation Snapshot from the Dispatcher, calls the active image provider
 * through the Provider Adapter, and stores the result.
 *
 * Lifecycle: queued → generating → downloading → storing → completed | failed
 *
 * The worker NEVER:
 *   - Resolves blueprint / APR / BT / dress / accessories / roles
 *   - Builds prompts
 *   - Chooses providers (the Dispatcher passes the provider config)
 *   - Reads or updates business tables
 *
 * Provider independence: the worker calls the adapter's generic methods
 * (textToImage, imageToImage, faceSwap, redux, virtualTryOn). It does not
 * import or reference any provider-specific module. Swapping Fal.ai for
 * ZenCreator requires no changes here — only the adapter implementation
 * (selected by the Provider Loader) changes.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { createAdapter } from "../_shared/image-provider.ts";
import { GenerationLifecycle } from "../_shared/generation-lifecycle.ts";
import type {
  FailedAtStep,
  GenerationSnapshot,
  ImageProviderAdapter,
  ProviderResult,
} from "../_shared/generation-types.ts";
import type {
  GenerationWorker,
  WorkerInput,
  WorkerResult,
} from "../_shared/worker-contract.ts";

const OUTPUT_BUCKET = "generation-outputs";

// ═══════════════════════════════════════════════════════════════════════════
// Single-stage adapter call (existing behaviour)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine which adapter method to call based on the snapshot contents.
 *
 * Priority:
 *   1. faceSwap   — snapshot has faceImageUrl + bodyImageUrl
 *   2. virtualTryOn — snapshot has garmentImageUrl + humanImageUrl
 *   3. redux      — snapshot has referenceImageUrl + renderTechnique === 'redux'
 *   4. imageToImage — snapshot has referenceImageUrl
 *   5. textToImage — default
 */
async function callAdapter(
  adapter: ImageProviderAdapter,
  snapshot: GenerationSnapshot,
): Promise<ProviderResult> {
  const p = snapshot.providerParameters;
  const assets = snapshot.inputAssets ?? {};

  if (assets.faceImageUrl && assets.bodyImageUrl) {
    return adapter.faceSwap({
      baseImageUrl: assets.bodyImageUrl,
      swapImageUrl: assets.faceImageUrl,
    });
  }

  if (assets.garmentImageUrl && (assets.referenceImageUrl || assets.bodyImageUrl)) {
    return adapter.virtualTryOn({
      humanImageUrl: assets.referenceImageUrl ?? assets.bodyImageUrl!,
      garmentImageUrl: assets.garmentImageUrl,
    });
  }

  if (assets.referenceImageUrl && snapshot.renderTechnique === "redux") {
    return adapter.redux({
      referenceUrl: assets.referenceImageUrl,
      prompt: snapshot.prompt,
      imageSize: p.imageSize,
      numInferenceSteps: p.numInferenceSteps,
      guidanceScale: p.creativity,
    });
  }

  if (snapshot.renderTechnique === "image_editor") {
    const imageAssets = assets.imageAssets ?? (assets.referenceImageUrl ? [assets.referenceImageUrl] : []);
    if (imageAssets.length > 0) {
      return adapter.imageEditor({
        prompt: snapshot.prompt,
        referenceImageUrl: imageAssets[0],
        additionalReferenceImageUrls: imageAssets.slice(1),
        model: typeof p.model === "string" ? p.model : undefined,
        ratio: typeof p.ratio === "string" ? p.ratio : undefined,
        batch_size: typeof p.batch_size === "number" ? p.batch_size : undefined,
        lora_adapter: typeof p.lora_adapter === "string" ? p.lora_adapter : undefined,
        seed: typeof p.seed === "number" ? p.seed : undefined,
        randomize_seed: typeof p.randomize_seed === "boolean" ? p.randomize_seed : undefined,
        guidance_scale: typeof p.guidance_scale === "number" ? p.guidance_scale : undefined,
        steps: typeof p.steps === "number" ? p.steps : undefined,
        atlas_size: typeof p.atlas_size === "string" ? p.atlas_size : undefined,
        atlas_output_format: typeof p.atlas_output_format === "string" ? p.atlas_output_format : undefined,
        atlas_thinking: typeof p.atlas_thinking === "string" ? p.atlas_thinking : undefined,
        atlas_prompt_optimization_mode: typeof p.atlas_prompt_optimization_mode === "string" ? p.atlas_prompt_optimization_mode : undefined,
      });
    }
  }

  if (assets.referenceImageUrl) {
    return adapter.imageToImage({
      prompt: snapshot.prompt,
      referenceImageUrl: assets.referenceImageUrl,
      strength: p.strength,
      numInferenceSteps: p.numInferenceSteps,
    });
  }

  return adapter.textToImage({
    prompt: snapshot.prompt,
    negativePrompt: snapshot.negativePrompt,
    imageSize: p.imageSize,
    numInferenceSteps: p.numInferenceSteps,
    seed: p.seed,
    outputFormat: typeof p.outputFormat === "string" ? p.outputFormat : undefined,
    safetyTolerance: typeof p.safetyTolerance === "string" ? p.safetyTolerance : undefined,
    model: typeof p.model === "string" ? p.model : undefined,
    ratio: typeof p.ratio === "string" ? p.ratio : undefined,
    atlas_size: typeof p.atlas_size === "string" ? p.atlas_size : undefined,
    atlas_output_format: typeof p.atlas_output_format === "string" ? p.atlas_output_format : undefined,
    atlas_thinking: typeof p.atlas_thinking === "string" ? p.atlas_thinking : undefined,
    atlas_prompt_optimization_mode: typeof p.atlas_prompt_optimization_mode === "string" ? p.atlas_prompt_optimization_mode : undefined,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Two-stage pipeline: scene generation → face-swap identity lock
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute the two-stage pipeline used by role-image generation:
 *
 *   Stage 1: text-to-image (or reference variation if referenceImageUrl is set)
 *            generates a fully-clothed scene with a visible face.
 *   Stage 2: face-swap locks the identity face onto the scene.
 *
 * If face-swap returns a 422 (no face detected), the pipeline retries with
 * a fresh scene up to MAX_FACE_SWAP_ATTEMPTS times.
 */
async function executeIdentityLockPipeline(
  adapter: ImageProviderAdapter,
  snapshot: GenerationSnapshot,
): Promise<ProviderResult> {
  const p = snapshot.providerParameters;
  const assets = snapshot.inputAssets ?? {};
  const faceUrl = assets.faceImageUrl;
  if (!faceUrl) throw new Error("identity_lock_pipeline requires inputAssets.faceImageUrl");

  const MAX_ATTEMPTS = 3;
  let lastError = "";
  let sceneUrl = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Stage 1: scene generation
    if (assets.referenceImageUrl) {
      const reduxResult = await adapter.redux({
        referenceUrl: assets.referenceImageUrl,
        prompt: snapshot.prompt,
        imageSize: p.imageSize ?? { width: 768, height: 1280 },
        guidanceScale: p.creativity ?? 2.5,
      });
      if (reduxResult.status !== "completed" || !reduxResult.outputUrl) {
        throw new Error(`Reference variation stage failed: ${reduxResult.error ?? "no output"}`);
      }
      sceneUrl = reduxResult.outputUrl;
    } else {
      const t2iResult = await adapter.textToImage({
        prompt: snapshot.prompt,
        imageSize: p.imageSize ?? { width: 768, height: 1280 },
      });
      if (t2iResult.status !== "completed" || !t2iResult.outputUrl) {
        throw new Error(`Text-to-image stage failed: ${t2iResult.error ?? "no output"}`);
      }
      sceneUrl = t2iResult.outputUrl;
    }

    // Stage 2: face-swap identity lock
    const fsResult = await adapter.faceSwap({
      baseImageUrl: sceneUrl,
      swapImageUrl: faceUrl,
    });

    if (fsResult.status === "completed" && fsResult.outputUrl) {
      return {
        ...fsResult,
        metadata: {
          ...fsResult.metadata,
          pipeline: "identity_lock_pipeline",
          intermediate_scene_url: sceneUrl,
          face_swap_attempts: attempt,
        },
      };
    }

    lastError = fsResult.error ?? "face-swap returned no output";
  }

  throw new Error(
    `Face-swap failed after ${MAX_ATTEMPTS} attempts: ${lastError}. ` +
    `The scene was generated without a clearly visible face.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Pipeline routing
// ═══════════════════════════════════════════════════════════════════════════

async function executePipeline(
  adapter: ImageProviderAdapter,
  snapshot: GenerationSnapshot,
): Promise<ProviderResult> {
  if (snapshot.renderTechnique === "identity_lock_pipeline") {
    return executeIdentityLockPipeline(adapter, snapshot);
  }
  return callAdapter(adapter, snapshot);
}

function getMethod(snapshot: GenerationSnapshot): string {
  if (snapshot.renderTechnique === "identity_lock_pipeline") return "identity_lock_pipeline";
  const assets = snapshot.inputAssets ?? {};
  if (assets.faceImageUrl && assets.bodyImageUrl) return "faceSwap";
  if (assets.garmentImageUrl) return "virtualTryOn";
  if (assets.referenceImageUrl && snapshot.renderTechnique === "redux") return "redux";
  if (assets.referenceImageUrl && snapshot.renderTechnique === "image_editor") return "imageEditor";
  if (assets.referenceImageUrl) return "imageToImage";
  return "textToImage";
}

// ═══════════════════════════════════════════════════════════════════════════
// Storage helpers
// ═══════════════════════════════════════════════════════════════════════════

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function downloadOutput(result: ProviderResult): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  if (result.outputBase64) {
    const base64Data = result.outputBase64.startsWith("data:")
      ? result.outputBase64.split(",")[1]!
      : result.outputBase64;
    return { bytes: base64ToBuffer(base64Data), contentType: "image/png" };
  }

  if (result.outputUrl) {
    const res = await fetch(result.outputUrl);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    const contentType = res.headers.get("content-type") ?? "image/png";
    return { bytes: await res.arrayBuffer(), contentType };
  }

  throw new Error("Provider returned no output URL or base64 data");
}

async function storeOutput(
  imageBytes: ArrayBuffer,
  contentType: string,
  creatorId: string,
  generationId: string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const ext = contentType.includes("jpeg") || contentType.includes("jpg")
    ? "jpg"
    : contentType.includes("webp")
    ? "webp"
    : "png";
  const storagePath = `${creatorId}/${generationId}.${ext}`;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error: uploadErr } = await admin.storage
    .from(OUTPUT_BUCKET)
    .upload(storagePath, imageBytes, { contentType, upsert: true });

  if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

  const { data: urlData } = admin.storage
    .from(OUTPUT_BUCKET)
    .getPublicUrl(storagePath);

  return { publicUrl: urlData.publicUrl, storagePath };
}

// ═══════════════════════════════════════════════════════════════════════════
// Worker Implementation
// ═══════════════════════════════════════════════════════════════════════════

export const imageWorker: GenerationWorker = {
  readonly assetType: "image",

  async execute(input: WorkerInput): Promise<WorkerResult> {
    const { generationId, snapshot, providerConfig } = input;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const lifecycle = new GenerationLifecycle(admin, generationId);
    const row = await lifecycle.load();
    if (!row) {
      return { status: "failed", error: `Generation ${generationId} not found` };
    }
    const creatorId = row.creator_id;

    let currentStep: FailedAtStep = "provider_call";

    try {
      currentStep = "provider_call";
      const adapter = createAdapter(providerConfig);
      await lifecycle.transition(
        "generating",
        `Calling ${providerConfig.provider_name} image adapter`,
        undefined,
        { provider: providerConfig.provider_name, method: getMethod(snapshot) },
      );

      const result = await executePipeline(adapter, snapshot);

      if (result.status === "processing" && result.providerGenerationId) {
        await lifecycle.saveProviderGenerationId(result.providerGenerationId);
        await lifecycle.transition(
          "processing",
          `Provider returned async job ${result.providerGenerationId}`,
          { provider_generation_id: result.providerGenerationId },
          { provider_generation_id: result.providerGenerationId },
        );
        return {
          status: "processing",
          providerGenerationId: result.providerGenerationId,
        };
      }

      if (result.status === "failed" || (!result.outputUrl && !result.outputBase64)) {
        await lifecycle.fail(
          "provider_call",
          result.error ?? "Provider returned no output",
          result.errorDetails ?? { result },
        );
        return {
          status: "failed",
          error: result.error ?? "Provider returned no output",
          errorDetails: result.errorDetails,
        };
      }

      currentStep = "download";
      await lifecycle.transition("downloading", "Downloading provider output");

      const downloaded = await downloadOutput(result);

      currentStep = "storage";
      await lifecycle.transition("storing", "Uploading to storage");

      const stored = await storeOutput(
        downloaded.bytes,
        downloaded.contentType,
        creatorId,
        generationId,
      );

      currentStep = "db_update";
      if (result.providerGenerationId) {
        await lifecycle.saveProviderGenerationId(result.providerGenerationId);
      }

      const metadata: Record<string, unknown> = {
        provider: providerConfig.provider_name,
        bytes: downloaded.bytes.byteLength,
        contentType: downloaded.contentType,
        ...(result.metadata ?? {}),
      };

      const success = await lifecycle.complete({
        bucket: OUTPUT_BUCKET,
        path: stored.storagePath,
        publicUrl: stored.publicUrl,
        metadata,
      });

      if (!success) {
        await lifecycle.fail(
          "db_update",
          "Image stored successfully but failed to update generation record to completed. Image is in storage — retry the generation or manually update the record.",
          { storagePath: stored.storagePath, publicUrl: stored.publicUrl },
        );
        return {
          status: "failed",
          error: "Image stored but DB update failed",
          errorDetails: { storagePath: stored.storagePath, publicUrl: stored.publicUrl },
        };
      }

      return {
        status: "completed",
        outputUrl: stored.publicUrl,
        outputMetadata: metadata,
        providerGenerationId: result.providerGenerationId,
      };
    } catch (e) {
      const msg = (e as Error).message;
      await lifecycle.fail(currentStep, msg, { stack: (e as Error).stack });
      return { status: "failed", error: msg };
    }
  },
};
