/**
 * Provider-agnostic image generation adapter layer.
 *
 * The generation pipeline calls getImageAdapter() to get an ImageProviderAdapter
 * whose methods (textToImage, imageToImage, faceSwap, redux, virtualTryOn)
 * encapsulate provider-specific endpoint paths, request bodies, authentication,
 * response parsing, and error handling.
 *
 * Adding a new provider: implement the ImageProviderAdapter interface and add
 * it to ADAPTER_REGISTRY. No generation function needs to change.
 */

import {
  loadProviderConfig,
  buildAuthHeaders as foundationBuildAuthHeaders,
  normalizeBaseUrl as foundationNormalizeBaseUrl,
} from "./generation-provider.ts";
import type {
  ProviderConfig,
  TextToImageParams,
  ImageToImageParams,
  FaceSwapParams,
  ReduxParams,
  VirtualTryOnParams,
  ImageEditorParams,
  ProviderResult,
  ImageProviderAdapter,
} from "./generation-types.ts";

export type {
  ProviderConfig,
  TextToImageParams,
  ImageToImageParams,
  FaceSwapParams,
  ReduxParams,
  VirtualTryOnParams,
  ImageEditorParams,
  ProviderResult,
  ImageProviderAdapter,
} from "./generation-types.ts";

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER LOADING — delegates to the foundation loader
// ═══════════════════════════════════════════════════════════════════════════

export async function getImageProvider(): Promise<ProviderConfig | null> {
  return loadProviderConfig("image");
}

export function buildAuthHeaders(provider: ProviderConfig): Record<string, string> {
  return foundationBuildAuthHeaders(provider);
}

export function normalizeBaseUrl(url: string): string {
  return foundationNormalizeBaseUrl(url);
}

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTER REGISTRY — provider-specific adapters register here
// ═══════════════════════════════════════════════════════════════════════════

type AdapterFactory = (provider: ProviderConfig) => ImageProviderAdapter;

const ADAPTER_REGISTRY: Record<string, AdapterFactory> = {
  promptchan:     (p) => new PromptchanAdapter(p),
  "fal.ai":       (p) => new FalAiAdapter(p),
  fal:            (p) => new FalAiAdapter(p),
  zencreator:     (p) => new ZenCreatorAdapter(p),
  "hugging face": (p) => new HuggingFaceAdapter(p),
  huggingface:    (p) => new HuggingFaceAdapter(p),
  "atlas cloud":  (p) => new AtlasCloudAdapter(p),
  atlascloud:     (p) => new AtlasCloudAdapter(p),
  atlas:          (p) => new AtlasCloudAdapter(p),
};

export function createAdapter(provider: ProviderConfig): ImageProviderAdapter {
  const name = provider.provider_name.toLowerCase();
  const factory = ADAPTER_REGISTRY[name];
  if (factory) return factory(provider);

  for (const key of Object.keys(ADAPTER_REGISTRY)) {
    if (name.includes(key)) return ADAPTER_REGISTRY[key](provider);
  }

  throw new Error(
    `No image adapter registered for provider "${provider.provider_name}". ` +
    `Add an entry to ADAPTER_REGISTRY in _shared/image-provider.ts.`,
  );
}

export async function getImageAdapter(): Promise<ImageProviderAdapter | null> {
  const provider = await getImageProvider();
  if (!provider) return null;
  return createAdapter(provider);
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function parseFalUrl(data: Record<string, unknown>, label: string): string {
  const images = data.images as Array<{ url?: string }> | undefined;
  const image  = data.image  as { url?: string } | undefined;
  const url    = images?.[0]?.url ?? image?.url ?? null;
  if (!url) throw new Error(`${label} returned no image URL. Keys: ${Object.keys(data).join(", ")}`);
  return url;
}

// ═══════════════════════════════════════════════════════════════════════════
// FAL.AI ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

class FalAiAdapter implements ImageProviderAdapter {
  readonly providerName = "Fal.ai";
  readonly providerMode = "sync" as const;

  constructor(private provider: ProviderConfig) {}

  private get headers(): Record<string, string> {
    return { "Content-Type": "application/json", ...buildAuthHeaders(this.provider) };
  }

  private get baseUrl(): string {
    return normalizeBaseUrl(this.provider.provider_url);
  }

  async textToImage(params: TextToImageParams): Promise<ProviderResult> {
    const res = await fetch(`${this.baseUrl}/fal-ai/flux-pro`, {
      method:  "POST",
      headers: this.headers,
      body: JSON.stringify({
        prompt:               params.prompt,
        image_size:           params.imageSize ?? "portrait_4_3",
        num_inference_steps:  params.numInferenceSteps ?? 28,
        num_images:           params.numImages ?? 1,
        safety_tolerance:     params.safetyTolerance ?? "2",
        ...(params.outputFormat ? { output_format: params.outputFormat } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Fal.ai text-to-image failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const url = parseFalUrl(await res.json() as Record<string, unknown>, "Fal.ai text-to-image");
    return { status: "completed", outputUrl: url };
  }

  async imageToImage(params: ImageToImageParams): Promise<ProviderResult> {
    const res = await fetch(`${this.baseUrl}/fal-ai/flux-pro/image-to-image`, {
      method:  "POST",
      headers: this.headers,
      body: JSON.stringify({
        prompt:               params.prompt,
        image_url:             params.referenceImageUrl,
        strength:              params.strength ?? 0.55,
        num_inference_steps:   params.numInferenceSteps ?? 28,
        num_images:            params.numImages ?? 1,
        safety_tolerance:      params.safetyTolerance ?? "2",
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Fal.ai image-to-image failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const url = parseFalUrl(await res.json() as Record<string, unknown>, "Fal.ai image-to-image");
    return { status: "completed", outputUrl: url };
  }

  async faceSwap(params: FaceSwapParams): Promise<ProviderResult> {
    const res = await fetch(`${this.baseUrl}/fal-ai/face-swap`, {
      method:  "POST",
      headers: this.headers,
      body: JSON.stringify({
        base_image_url:  params.baseImageUrl,
        swap_image_url:   params.swapImageUrl,
      }),
    });
    if (res.status === 422) return { status: "failed", error: "No face detected (422)" };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Fal.ai face-swap failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = await res.json() as Record<string, unknown>;
    const url   = (data.image as { url?: string })?.url
               ?? (data.images as Array<{ url?: string }>)?.[0]?.url
               ?? null;
    if (!url) throw new Error(`Fal.ai face-swap returned no image URL. Keys: ${Object.keys(data).join(", ")}`);
    return { status: "completed", outputUrl: url };
  }

  async redux(params: ReduxParams): Promise<ProviderResult> {
    const res = await fetch(`${this.baseUrl}/fal-ai/flux-pro/v1/redux`, {
      method:  "POST",
      headers: this.headers,
      body: JSON.stringify({
        image_url:             params.referenceUrl,
        prompt:                params.prompt,
        image_size:            params.imageSize ?? { width: 768, height: 1280 },
        num_inference_steps:   params.numInferenceSteps ?? 28,
        guidance_scale:        params.guidanceScale ?? 2.5,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Fal.ai redux failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const url = parseFalUrl(await res.json() as Record<string, unknown>, "Fal.ai redux");
    return { status: "completed", outputUrl: url };
  }

  async virtualTryOn(params: VirtualTryOnParams): Promise<ProviderResult> {
    const res = await fetch(`${this.baseUrl}/fal-ai/cat-vton`, {
      method:  "POST",
      headers: this.headers,
      body: JSON.stringify({
        human_image_url:    params.humanImageUrl,
        garment_image_url:  params.garmentImageUrl,
        cloth_type:         params.clothType ?? "overall",
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Fal.ai cat-vton failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = await res.json() as Record<string, unknown>;
    const url   = (data.image as { url?: string })?.url
               ?? (data.images as Array<{ url?: string }>)?.[0]?.url
               ?? null;
    if (!url) throw new Error(`Fal.ai cat-vton returned no image URL. Keys: ${Object.keys(data).join(", ")}`);
    return { status: "completed", outputUrl: url };
  }

  async imageEditor(_params: ImageEditorParams): Promise<ProviderResult> {
    throw new Error("imageEditor is not supported by Fal.ai. Set ZenCreator as the active image provider for this operation.");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPTCHAN ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

class PromptchanAdapter implements ImageProviderAdapter {
  readonly providerName = "Promptchan";
  readonly providerMode = "sync" as const;

  constructor(private provider: ProviderConfig) {}

  private get headers(): Record<string, string> {
    return { "Content-Type": "application/json", ...buildAuthHeaders(this.provider) };
  }

  private get baseUrl(): string {
    return normalizeBaseUrl(this.provider.provider_url);
  }

  private parseResponseImage(data: Record<string, unknown>): string {
    const imageB64 = data.image as string | undefined;
    if (!imageB64) throw new Error(`Promptchan returned no image. Response: ${JSON.stringify(data).slice(0, 400)}`);
    if (imageB64.startsWith("data:")) return imageB64;
    return `data:image/png;base64,${imageB64}`;
  }

  async textToImage(params: TextToImageParams): Promise<ProviderResult> {
    const body: Record<string, unknown> = { prompt: params.prompt };
    if (params.imageSize) {
      body.image_size = typeof params.imageSize === "string"
        ? params.imageSize
        : `${params.imageSize.width}x${params.imageSize.height}`;
    }
    const res = await fetch(`${this.baseUrl}/api/external/create`, {
      method:  "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Promptchan text-to-image failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const url = this.parseResponseImage(await res.json() as Record<string, unknown>);
    return { status: "completed", outputUrl: url };
  }

  async imageToImage(_params: ImageToImageParams): Promise<ProviderResult> {
    throw new Error("imageToImage is not supported by Promptchan. Set Fal.ai as the active image provider for this operation.");
  }

  async faceSwap(_params: FaceSwapParams): Promise<ProviderResult> {
    throw new Error("faceSwap is not supported by Promptchan. Set Fal.ai as the active image provider for this operation.");
  }

  async redux(_params: ReduxParams): Promise<ProviderResult> {
    throw new Error("redux is not supported by Promptchan. Set Fal.ai as the active image provider for this operation.");
  }

  async virtualTryOn(_params: VirtualTryOnParams): Promise<ProviderResult> {
    throw new Error("virtualTryOn is not supported by Promptchan. Set Fal.ai as the active image provider for this operation.");
  }

  async imageEditor(_params: ImageEditorParams): Promise<ProviderResult> {
    throw new Error("imageEditor is not supported by Promptchan. Set ZenCreator as the active image provider for this operation.");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ZENCREATOR ADAPTER
// ═══════════════════════════════════════════════════════════════════════════
//
// ZenCreator API is async:
//   1. POST   /api/public/v1/generations          { tool, input } → { id, status: "queued" }
//   2. GET    /api/public/v1/generations/{id}                        → { id, status, progress, error }
//   3. GET    /api/public/v1/generations/{id}/result                → { image_asset } | { image_assets: [...] }
//   4. GET    /api/public/v1/assets/{assetId}                       → { id, url, ... }
//
// Image tools (from /api/public/v1/tools):
//   t2i        — text-to-image          (output: image_asset)
//   by_prompt  — text-to-image (v1)     (output: image_asset)
//   i2i        — image-to-image         (output: image_assets[])
//   by_ref     — image-to-image (v1)    (output: image_assets[])
//   faceswap   — face swap              (output: image_asset)
//   image_editor — edit by prompt      (output: image_assets[])
//
// For image-to-image / face-swap, input images must be uploaded as assets first:
//   POST /api/public/v1/assets  (multipart form-data, field "file")
//   → { id, ... }  (asset ID)

class ZenCreatorAdapter implements ImageProviderAdapter {
  readonly providerName = "ZenCreator";
  readonly providerMode  = "async" as const;

  constructor(private provider: ProviderConfig) {}

  private get headers(): Record<string, string> {
    return { "Content-Type": "application/json", "Accept": "application/json", ...buildAuthHeaders(this.provider) };
  }

  private get baseUrl(): string {
    return normalizeBaseUrl(this.provider.provider_url);
  }

  // ── Async generation helpers ──────────────────────────────────────────────

  private async createGeneration(tool: string, input: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/public/v1/generations`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ tool, input }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ZenCreator create generation (${tool}) failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = await res.json() as { id?: string; error?: { message?: string } };
    if (!data.id) throw new Error(`ZenCreator create generation returned no id: ${JSON.stringify(data).slice(0, 400)}`);
    return data.id;
  }

  private async pollGeneration(genId: string, timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await fetch(`${this.baseUrl}/api/public/v1/generations/${genId}`, {
        method: "GET",
        headers: this.headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`ZenCreator poll status failed (${res.status}): ${text.slice(0, 400)}`);
      }
      const data = await res.json() as { status?: string; progress?: number; error?: string | null };
      if (data.status === "completed" || data.status === "succeeded") return;
      if (data.status === "failed") throw new Error(`ZenCreator generation failed: ${data.error ?? "unknown error"}`);
      await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error(`ZenCreator generation ${genId} timed out after ${timeoutMs / 1000}s`);
  }

  private async fetchGenerationResult(genId: string): Promise<{ assetIds: string[]; directUrls: string[] }> {
    const res = await fetch(`${this.baseUrl}/api/public/v1/generations/${genId}/result`, {
      method: "GET",
      headers: this.headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ZenCreator fetch result failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = await res.json() as {
      image_asset?: string;
      image_assets?: string[];
      outputs?: { asset_id?: string; url?: string; download_url?: string }[];
    };
    const assetIds: string[] = [];
    const directUrls: string[] = [];
    if (data.image_asset) assetIds.push(data.image_asset);
    if (Array.isArray(data.image_assets)) assetIds.push(...data.image_assets);
    if (Array.isArray(data.outputs)) {
      for (const out of data.outputs) {
        if (out.asset_id) assetIds.push(out.asset_id);
        if (out.download_url) directUrls.push(out.download_url);
        else if (out.url) directUrls.push(out.url);
      }
    }
    if (assetIds.length === 0 && directUrls.length === 0) {
      throw new Error(`ZenCreator result returned no image assets: ${JSON.stringify(data).slice(0, 400)}`);
    }
    return { assetIds, directUrls };
  }

  private async resolveAssetUrl(assetId: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/public/v1/assets/${assetId}`, {
      method: "GET",
      headers: this.headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ZenCreator resolve asset ${assetId} failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = await res.json() as { url?: string; download_url?: string; public_url?: string; image_url?: string };
    const url = data.download_url ?? data.url ?? data.public_url ?? data.image_url;
    if (!url) throw new Error(`ZenCreator asset ${assetId} has no URL: ${JSON.stringify(data).slice(0, 400)}`);
    return url;
  }

  private async runGeneration(tool: string, input: Record<string, unknown>): Promise<ProviderResult> {
    const genId = await this.createGeneration(tool, input);
    await this.pollGeneration(genId);
    const { assetIds, directUrls } = await this.fetchGenerationResult(genId);
    const outputUrl = directUrls[0] ?? (assetIds[0] ? await this.resolveAssetUrl(assetIds[0]) : "");
    return {
      status: "completed",
      outputUrl,
      providerGenerationId: genId,
      metadata: {
        provider: "ZenCreator",
        tool,
        generation_id: genId,
        asset_ids: assetIds,
        batch_size: assetIds.length || directUrls.length,
      },
    };
  }

  // ── Asset upload (for image-to-image / face-swap) ─────────────────────────

  private async uploadAsset(imageUrl: string): Promise<string> {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) throw new Error(`Failed to download image for upload: ${imageUrl} (${imgRes.status})`);
    const blob = await imgRes.blob();
    const contentType = imgRes.headers.get("content-type") ?? "image/png";
    const ext = contentType.includes("jpeg") || contentType.includes("jpg")
      ? "jpg"
      : contentType.includes("webp")
      ? "webp"
      : "png";
    const formData = new FormData();
    formData.append("file", blob, `upload.${ext}`);
    formData.append("media_type", contentType);

    const res = await fetch(`${this.baseUrl}/api/public/v1/assets`, {
      method: "POST",
      headers: { ...buildAuthHeaders(this.provider) },
      body: formData,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ZenCreator asset upload failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = await res.json() as { asset_id?: string; id?: string };
    const assetId = data.asset_id ?? data.id;
    if (!assetId) throw new Error(`ZenCreator asset upload returned no asset_id: ${JSON.stringify(data).slice(0, 400)}`);
    return assetId;
  }

  // ── Parameter mapping ────────────────────────────────────────────────────

  private mapImageSize(imageSize?: string | { width: number; height: number }): { ratio?: string; width?: number; height?: number } {
    if (!imageSize) return {};
    if (typeof imageSize === "object") {
      return { width: imageSize.width, height: imageSize.height };
    }
    const ratioMap: Record<string, string> = {
      "512x768": "2:3", "768x512": "3:2", "512x512": "1:1",
      "768x1280": "3:4", "1280x768": "4:3", "1024x1024": "1:1",
      "1024x1536": "2:3", "1536x1024": "3:2",
    };
    const ratio = ratioMap[imageSize];
    return ratio ? { ratio } : {};
  }

  // ── ImageProviderAdapter implementation ──────────────────────────────────

  async textToImage(params: TextToImageParams): Promise<ProviderResult> {
    const sizeParams = this.mapImageSize(params.imageSize);
    const input: Record<string, unknown> = {
      positive_prompt: params.prompt,
      model: params.model ?? "GENERAL_NSFW",
      mode: "fast",
      ...sizeParams,
    };
    if (params.ratio) input.ratio = params.ratio;
    if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
    if (params.numImages && params.numImages > 1) input.batch_size = params.numImages;
    return this.runGeneration("by_prompt", input);
  }

  async imageToImage(params: ImageToImageParams): Promise<ProviderResult> {
    const refAsset = await this.uploadAsset(params.referenceImageUrl);
    const input: Record<string, unknown> = {
      ref_asset: refAsset,
      model: "GENERAL",
      mode: "fast",
      positive_prompt: params.prompt,
      batch_size: 1,
    };
    if (params.strength !== undefined) input.strength = params.strength;
    return this.runGeneration("i2i", input);
  }

  async faceSwap(params: FaceSwapParams): Promise<ProviderResult> {
    const refAsset = await this.uploadAsset(params.baseImageUrl);
    const faceAsset = await this.uploadAsset(params.swapImageUrl);
    const input: Record<string, unknown> = {
      ref_asset: refAsset,
      face_asset: faceAsset,
      model: "GENERAL_ADVANCED",
      resolution: "4K",
    };
    return this.runGeneration("faceswap", input);
  }

  async redux(params: ReduxParams): Promise<ProviderResult> {
    const refAsset = await this.uploadAsset(params.referenceUrl);
    const sizeParams = this.mapImageSize(params.imageSize);
    const input: Record<string, unknown> = {
      ref_asset: refAsset,
      model: "SEEDREAM_5_PRO",
      mode: "fast",
      positive_prompt: params.prompt,
      batch_size: 1,
      ...sizeParams,
    };
    if (params.guidanceScale !== undefined) input.strength = params.guidanceScale / 10;
    return this.runGeneration("by_ref", input);
  }

  async virtualTryOn(_params: VirtualTryOnParams): Promise<ProviderResult> {
    throw new Error("virtualTryOn is not supported by ZenCreator. Use the image_editor tool with a garment reference image instead.");
  }

  async imageEditor(params: ImageEditorParams): Promise<ProviderResult> {
    const refAsset = await this.uploadAsset(params.referenceImageUrl);
    const additionalAssets = params.additionalReferenceImageUrls
      ? await Promise.all(params.additionalReferenceImageUrls.map((url) => this.uploadAsset(url)))
      : [];
    const input: Record<string, unknown> = {
      image_assets: [refAsset, ...additionalAssets],
      prompt: params.prompt,
      number_of_images: params.batch_size ?? 1,
    };
    if (params.model) input.model = params.model;
    if (params.ratio) input.ratio = params.ratio;
    return this.runGeneration("image_editor", input);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HUGGING FACE ADAPTER (Qwen Image Edit Gradio API)
// ═══════════════════════════════════════════════════════════════════════════
//
// Hugging Face Space running the Qwen Image Edit model via Gradio v2 API.
//
// Flow:
//   1. POST   /gradio_api/call/v2/edit_image  { images_b64_json, prompt, ... } → { event_id }
//   2. GET    /gradio_api/call/edit_image/{event_id}  (SSE stream)
//   3. Read SSE until the completion event, which contains the result image(s).
//
// The input image is sent inline as a data URL inside images_b64_json, which
// is a STRING containing a JSON array of data URLs:
//   "[\"data:image/png;base64,...\"]"
//
// Authentication is an optional Bearer token. If no token is configured
// (auth_method = 'none' or empty api_key), no Authorization header is sent.

class HuggingFaceAdapter implements ImageProviderAdapter {
  readonly providerName = "Hugging Face";
  readonly providerMode  = "async" as const;

  constructor(private provider: ProviderConfig) {}

  private get headers(): Record<string, string> {
    return { "Content-Type": "application/json", ...buildAuthHeaders(this.provider) };
  }

  private get baseUrl(): string {
    return normalizeBaseUrl(this.provider.provider_url);
  }

  // ── Fetch a URL as a data URL (base64) ──────────────────────────────────────
  private async fetchAsDataUrl(url: string): Promise<string> {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Failed to download image for HF edit: ${url} (${res.status})`);
    const blob = await res.blob();
    const contentType = res.headers.get("content-type") ?? "image/png";
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    return `data:${contentType};base64,${base64}`;
  }

  // ── SSE stream consumer ─────────────────────────────────────────────────────
  // Reads the SSE stream from the Gradio result endpoint until the completion
  // event arrives, then parses the JSON payload to extract the image.
  private async consumeSseAndExtractImage(
    eventId: string,
    timeoutMs = 120_000,
  ): Promise<string> {
    const statusPath = (this.provider.generation_status_endpoint ?? "")
      .replace("{generation_id}", eventId);
    const statusUrl = `${this.baseUrl}${statusPath}`;

    const res = await fetch(statusUrl, {
      method: "GET",
      headers: this.headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Hugging Face SSE fetch failed (${res.status}): ${text.slice(0, 400)}`);
    }
    if (!res.body) throw new Error("Hugging Face SSE stream has no body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const deadline = Date.now() + timeoutMs;

    try {
      while (Date.now() < deadline) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines.
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const eventBlock of events) {
          const lines = eventBlock.split("\n");
          let eventType = "";
          let eventData = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) eventData += line.slice(5).trim();
          }

          // Gradio sends "error" event when the generation fails (GPU quota,
          // no GPU available, safety check failure, etc.). Surface it immediately
          // instead of waiting for a "complete" event that will never arrive.
          if (eventType === "error") {
            let errorMsg = "Hugging Face generation failed";
            try {
              const errObj = JSON.parse(eventData) as { error?: string; title?: string };
              if (errObj.error) errorMsg = errObj.error;
              if (errObj.title) errorMsg = `${errObj.title}: ${errorMsg}`;
            } catch { /* use default */ }
            throw new Error(`Hugging Face error: ${errorMsg}`);
          }

          // Gradio sends "complete" event with the result data.
          if (eventType === "complete") {
            return this.parseGradioResult(eventData);
          }
          // Some Gradio versions send the data without an explicit event type.
          if (!eventType && eventData) {
            try {
              return this.parseGradioResult(eventData);
            } catch {
              // Not the completion payload — keep reading.
            }
          }
        }
      }
      throw new Error("Hugging Face SSE stream timed out waiting for completion event");
    } finally {
      try { reader.cancel(); } catch { /* ignore */ }
    }
  }

  // ── Parse the Gradio completion payload ────────────────────────────────────
  // Gradio completion data is a JSON array. For image edit, the first element
  // is an array of image objects, each with a "url" field (which may itself be
  // a data URL or a remote URL).
  private parseGradioResult(data: string): string {
    if (!data) throw new Error("Hugging Face completion event has no data");
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new Error(`Hugging Face completion data is not valid JSON: ${data.slice(0, 200)}`);
    }

    // Gradio wraps the result as [[{url, ...}], ...] or [{url, ...}, ...]
    let imageObjs: Array<{ url?: string; path?: string; image?: string }> | null = null;

    if (Array.isArray(parsed)) {
      const first = parsed[0];
      if (Array.isArray(first)) {
        imageObjs = first as Array<{ url?: string; path?: string; image?: string }>;
      } else if (first && typeof first === "object") {
        imageObjs = parsed as Array<{ url?: string; path?: string; image?: string }>;
      }
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as { url?: string; path?: string; image?: string };
      imageObjs = [obj];
    }

    if (!imageObjs || imageObjs.length === 0) {
      throw new Error(`Hugging Face result has no image objects: ${data.slice(0, 300)}`);
    }

    const firstImage = imageObjs[0];
    const imageUrl = firstImage.url ?? firstImage.path ?? firstImage.image;
    if (!imageUrl) {
      throw new Error(`Hugging Face result image has no url/path/image field: ${JSON.stringify(firstImage).slice(0, 300)}`);
    }
    return imageUrl;
  }

  // ── ImageProviderAdapter implementation ────────────────────────────────────

  async imageEditor(params: ImageEditorParams): Promise<ProviderResult> {
    // Convert the reference image to a data URL if it isn't one already.
    let dataUrl = params.referenceImageUrl;
    if (!dataUrl.startsWith("data:")) {
      dataUrl = await this.fetchAsDataUrl(dataUrl);
    }

    // images_b64_json is a STRING containing a JSON array of data URLs.
    const additionalDataUrls = params.additionalReferenceImageUrls
      ? await Promise.all(
          params.additionalReferenceImageUrls.map((url) =>
            url.startsWith("data:") ? Promise.resolve(url) : this.fetchAsDataUrl(url),
          ),
        )
      : [];
    const imagesArray = [dataUrl, ...additionalDataUrls];
    const imagesB64Json = JSON.stringify(imagesArray);

    const body: Record<string, unknown> = {
      images_b64_json: imagesB64Json,
      prompt: params.prompt,
      lora_adapter: params.lora_adapter ?? params.model ?? "",
      seed: params.seed ?? 0,
      randomize_seed: params.randomize_seed ?? true,
      guidance_scale: params.guidance_scale ?? 1.0,
      steps: params.steps ?? 4,
    };

    // 1. POST to the generation endpoint to get an event_id.
    const genPath = this.provider.generation_endpoint || "/gradio_api/call/v2/edit_image";
    const genUrl = `${this.baseUrl}${genPath}`;
    const genRes = await fetch(genUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!genRes.ok) {
      const text = await genRes.text().catch(() => "");
      throw new Error(`Hugging Face edit_image request failed (${genRes.status}): ${text.slice(0, 400)}`);
    }
    const genData = await genRes.json() as { event_id?: string; error?: string };
    if (!genData.event_id) {
      throw new Error(`Hugging Face edit_image returned no event_id: ${JSON.stringify(genData).slice(0, 400)}`);
    }
    const eventId = genData.event_id;

    // 2. Consume the SSE stream to get the result.
    const outputUrl = await this.consumeSseAndExtractImage(eventId);

    return {
      status: "completed",
      outputUrl: outputUrl.startsWith("data:") ? undefined : outputUrl,
      outputBase64: outputUrl.startsWith("data:") ? outputUrl : undefined,
      providerGenerationId: eventId,
      metadata: {
        provider: "Hugging Face",
        event_id: eventId,
        lora_adapter: body.lora_adapter,
      },
    };
  }

  async textToImage(_params: TextToImageParams): Promise<ProviderResult> {
    throw new Error("textToImage is not supported by Hugging Face. This provider only supports image editing (imageEditor).");
  }

  async imageToImage(params: ImageToImageParams): Promise<ProviderResult> {
    // Hugging Face Qwen Image Edit can function as image-to-image.
    return this.imageEditor({
      prompt: params.prompt,
      referenceImageUrl: params.referenceImageUrl,
    });
  }

  async faceSwap(_params: FaceSwapParams): Promise<ProviderResult> {
    throw new Error("faceSwap is not supported by Hugging Face. Set ZenCreator as the active image provider for this operation.");
  }

  async redux(_params: ReduxParams): Promise<ProviderResult> {
    throw new Error("redux is not supported by Hugging Face. Set ZenCreator as the active image provider for this operation.");
  }

  async virtualTryOn(_params: VirtualTryOnParams): Promise<ProviderResult> {
    throw new Error("virtualTryOn is not supported by Hugging Face. Set ZenCreator as the active image provider for this operation.");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ATLAS CLOUD ADAPTER (Seedream v5.0 Pro Edit)
// ═══════════════════════════════════════════════════════════════════════════
//
// Atlas Cloud API for bytedance/seedream-v5.0-pro/edit is async:
//   1. POST   /api/v1/model/generateImage     { model, prompt, images, size, ... } → { data: { id, status } }
//   2. GET    /api/v1/model/prediction/{id}   → { data: { status, outputs: [url] } }
//   3. GET    /api/v1/model/result/{id}       → { data: { outputs: [url] } }
//
// Auth: Bearer token.
// Reference images: array of URLs or Base64 data URLs (1–10 images).
// Output: single image, returned as a hosted URL.

class AtlasCloudAdapter implements ImageProviderAdapter {
  readonly providerName = "Atlas Cloud";
  readonly providerMode  = "async" as const;

  constructor(private provider: ProviderConfig) {}

  private get headers(): Record<string, string> {
    return { "Content-Type": "application/json", ...buildAuthHeaders(this.provider) };
  }

  private get baseUrl(): string {
    return normalizeBaseUrl(this.provider.provider_url);
  }

  private async pollPrediction(predictionId: string, timeoutMs = 120_000): Promise<string> {
    const statusPath = (this.provider.generation_status_endpoint ?? "/api/v1/model/prediction/{generation_id}")
      .replace("{generation_id}", predictionId)
      .replace("{prediction_id}", predictionId);
    const statusUrl = `${this.baseUrl}${statusPath}`;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const res = await fetch(statusUrl, {
        method: "GET",
        headers: this.headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Atlas Cloud poll status failed (${res.status}): ${text.slice(0, 400)}`);
      }
      const data = await res.json() as {
        data?: { status?: string; outputs?: string[]; error?: string };
      };
      const status = data.data?.status;
      if (status === "completed" || status === "succeeded") {
        const outputs = data.data?.outputs;
        if (outputs && outputs.length > 0) return outputs[0];
        break;
      }
      if (status === "failed") {
        throw new Error(`Atlas Cloud generation failed: ${data.data?.error ?? "unknown error"}`);
      }
      await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error(`Atlas Cloud generation ${predictionId} timed out after ${timeoutMs / 1000}s`);
  }

  private async fetchResult(predictionId: string): Promise<string> {
    const resultPath = (this.provider.generation_result_endpoint ?? "/api/v1/model/result/{generation_id}")
      .replace("{generation_id}", predictionId)
      .replace("{request_id}", predictionId);
    const resultUrl = `${this.baseUrl}${resultPath}`;
    const res = await fetch(resultUrl, {
      method: "GET",
      headers: this.headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Atlas Cloud fetch result failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = await res.json() as {
      data?: { outputs?: string[]; output?: string; url?: string };
    };
    const outputs = data.data?.outputs;
    if (outputs && outputs.length > 0) return outputs[0];
    const single = data.data?.output ?? data.data?.url;
    if (single) return single;
    throw new Error(`Atlas Cloud result returned no output: ${JSON.stringify(data).slice(0, 400)}`);
  }

  // ── ImageProviderAdapter implementation ──────────────────────────────────

  async imageEditor(params: ImageEditorParams): Promise<ProviderResult> {
    const images = [params.referenceImageUrl, ...(params.additionalReferenceImageUrls ?? [])];

    const body: Record<string, unknown> = {
      model: params.model ?? "bytedance/seedream-v5.0-pro/edit",
      prompt: params.prompt,
      images,
    };
    if (params.atlas_size) body.size = params.atlas_size;
    if (params.atlas_output_format) body.output_format = params.atlas_output_format;
    if (params.atlas_thinking) body.thinking = params.atlas_thinking;
    if (params.atlas_prompt_optimization_mode) body.prompt_optimization_mode = params.atlas_prompt_optimization_mode;

    const genPath = this.provider.generation_endpoint || "/api/v1/model/generateImage";
    const genUrl = `${this.baseUrl}${genPath}`;
    const genRes = await fetch(genUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!genRes.ok) {
      const text = await genRes.text().catch(() => "");
      throw new Error(`Atlas Cloud generateImage failed (${genRes.status}): ${text.slice(0, 400)}`);
    }
    const genData = await genRes.json() as {
      data?: { id?: string; status?: string; error?: string };
      error?: string;
    };
    const predictionId = genData.data?.id;
    if (!predictionId) {
      throw new Error(`Atlas Cloud generateImage returned no prediction id: ${JSON.stringify(genData).slice(0, 400)}`);
    }

    let outputUrl: string;
    try {
      outputUrl = await this.pollPrediction(predictionId);
    } catch {
      outputUrl = await this.fetchResult(predictionId);
    }

    return {
      status: "completed",
      outputUrl,
      providerGenerationId: predictionId,
      metadata: {
        provider: "Atlas Cloud",
        model: body.model,
        prediction_id: predictionId,
        size: body.size ?? "2048*2048",
        output_format: body.output_format ?? "jpeg",
      },
    };
  }

  async textToImage(params: TextToImageParams): Promise<ProviderResult> {
    const body: Record<string, unknown> = {
      model: params.model ?? "bytedance/seedream-v5.0-pro/text-to-image",
      prompt: params.prompt,
    };
    if (params.atlas_size) body.size = params.atlas_size;
    if (params.atlas_output_format) body.output_format = params.atlas_output_format;
    if (params.atlas_thinking) body.thinking = params.atlas_thinking;
    if (params.atlas_prompt_optimization_mode) body.prompt_optimization_mode = params.atlas_prompt_optimization_mode;

    const genPath = this.provider.generation_endpoint || "/api/v1/model/generateImage";
    const genUrl = `${this.baseUrl}${genPath}`;
    const genRes = await fetch(genUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!genRes.ok) {
      const text = await genRes.text().catch(() => "");
      throw new Error(`Atlas Cloud T2I generateImage failed (${genRes.status}): ${text.slice(0, 400)}`);
    }
    const genData = await genRes.json() as {
      data?: { id?: string; status?: string; error?: string };
      error?: string;
    };
    const predictionId = genData.data?.id;
    if (!predictionId) {
      throw new Error(`Atlas Cloud T2I returned no prediction id: ${JSON.stringify(genData).slice(0, 400)}`);
    }

    let outputUrl: string;
    try {
      outputUrl = await this.pollPrediction(predictionId);
    } catch {
      outputUrl = await this.fetchResult(predictionId);
    }

    return {
      status: "completed",
      outputUrl,
      providerGenerationId: predictionId,
      metadata: {
        provider: "Atlas Cloud",
        model: body.model,
        prediction_id: predictionId,
        size: body.size ?? "2048*2048",
        output_format: body.output_format ?? "jpeg",
      },
    };
  }

  async imageToImage(params: ImageToImageParams): Promise<ProviderResult> {
    return this.imageEditor({
      prompt: params.prompt,
      referenceImageUrl: params.referenceImageUrl,
    });
  }

  async faceSwap(_params: FaceSwapParams): Promise<ProviderResult> {
    throw new Error("faceSwap is not supported by Atlas Cloud. Set ZenCreator as the active image provider for this operation.");
  }

  async redux(_params: ReduxParams): Promise<ProviderResult> {
    throw new Error("redux is not supported by Atlas Cloud. Set ZenCreator as the active image provider for this operation.");
  }

  async virtualTryOn(_params: VirtualTryOnParams): Promise<ProviderResult> {
    throw new Error("virtualTryOn is not supported by Atlas Cloud. Set ZenCreator as the active image provider for this operation.");
  }
}
