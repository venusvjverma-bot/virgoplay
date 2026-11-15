import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createGeneration } from "../_shared/generation-lifecycle.ts";
import {
  loadProviderConfig,
  buildAuthHeaders,
  normalizeBaseUrl,
  resolveEndpoint,
} from "../_shared/generation-provider.ts";
import type { GenerationSnapshot, ProviderConfig } from "../_shared/generation-types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function failGeneration(
  admin: ReturnType<typeof createClient>,
  generationId: string,
  step: string,
  message: string,
): Promise<void> {
  await admin.from("generations").update({
    status: "failed",
    failed_at_step: step,
    error_message: message,
    completed_at: new Date().toISOString(),
  }).eq("id", generationId);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
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

    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json() as { scene_production_id?: string };
    const sceneProductionId = body.scene_production_id;
    if (!sceneProductionId) return respond({ error: "scene_production_id is required" }, 400);

    // ── Load the scene_image_productions row ──────────────────────────────────
    const { data: sceneProd, error: sceneErr } = await admin
      .from("scene_image_productions")
      .select("*")
      .eq("id", sceneProductionId)
      .eq("creator_id", creatorId)
      .maybeSingle();

    if (sceneErr || !sceneProd) {
      return respond({ error: "Scene production record not found or does not belong to this creator." }, 404);
    }

    // ── Verify the scene image is Ready ──────────────────────────────────────
    if (sceneProd.scene_image_status !== "Ready" || !sceneProd.scene_image_url) {
      return respond({ error: "Scene image must be successfully generated before creating a video." }, 422);
    }

    const sceneImageUrl: string = sceneProd.scene_image_url;

    // ── Load the active IMAGE provider ────────────────────────────────────────
    const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
    if (!providerConfig) {
      return respond({ error: "No active image provider configured." }, 422);
    }

    const providerName = providerConfig.provider_name.toLowerCase();
    const isZenCreator = providerName.includes("zencreator");
    const isAtlasCloud = providerName.includes("atlas");

    if (!isZenCreator && !isAtlasCloud) {
      return respond({ error: "Video generation requires ZenCreator or Atlas Cloud as the active provider." }, 422);
    }

    // ── Read saved video configuration from the scene row ────────────────────
    const videoProvider: string = sceneProd.video_provider || "zencreator";

    if (isAtlasCloud || videoProvider === "atlas") {
      return await generateAtlasCloudVideo(
        admin, providerConfig, sceneProd, sceneProductionId, sceneImageUrl, creatorId,
      );
    }

    return await generateZenCreatorVideo(
      admin, providerConfig, sceneProd, sceneProductionId, sceneImageUrl, creatorId,
    );
  } catch (err) {
    return respond({ error: (err as Error).message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ATLAS CLOUD — Wan 3.0 Image-to-Video
// ═══════════════════════════════════════════════════════════════════════════

async function generateAtlasCloudVideo(
  admin: ReturnType<typeof createClient>,
  provider: ProviderConfig,
  sceneProd: Record<string, unknown>,
  sceneProductionId: string,
  sceneImageUrl: string,
  creatorId: string,
): Promise<Response> {
  const videoModel: string = (sceneProd.video_wan_model as string) || "alibaba/wan-3.0/image-to-video";
  const videoResolution: string = (sceneProd.video_wan_resolution as string) || "1080P";
  const videoDuration: number = (sceneProd.video_wan_duration as number) ?? 5;
  const videoAudio: boolean = (sceneProd.video_wan_audio as boolean) ?? true;
  const videoLastImage: string | null = (sceneProd.video_wan_last_image_url as string) || null;
  const videoPrompt: string = (sceneProd.video_prompt as string) || "";

  // ── Build the Wan 3.0 I2V payload (strictly from official API spec) ────────
  const payload: Record<string, unknown> = {
    model: videoModel,
    prompt: videoPrompt,
    image: sceneImageUrl,
    resolution: videoResolution,
    duration: videoDuration,
    audio: videoAudio,
  };
  if (videoLastImage) payload.last_image = videoLastImage;

  // ── Build the Generation Snapshot ────────────────────────────────────────
  const snapshot: GenerationSnapshot = {
    prompt: videoPrompt,
    renderTechnique: "videogen",
    inputAssets: {
      imageAssets: [sceneImageUrl, ...(videoLastImage ? [videoLastImage] : [])],
    },
    providerParameters: {
      ...payload,
    },
    providerMetadata: {
      scene_production_id: sceneProductionId,
      role_id: sceneProd.role_id as string,
      scene_id: sceneProd.scene_id as string,
      gen_tool: "videogen",
      provider: "atlas_cloud",
      model: videoModel,
    },
  };

  // ── Create Generation record ──────────────────────────────────────────────
  const generationId = await createGeneration(admin, {
    creator_id: creatorId,
    asset_type: "video",
    asset_subtype: "scene",
    business_ref_type: "scene_image_productions",
    business_ref_id: sceneProductionId,
    provider_id: provider.id,
    provider_name: provider.provider_name,
    provider_model: videoModel,
    snapshot: snapshot as Record<string, unknown>,
    version: 1,
  });

  if (!generationId) {
    return respond({ error: "Failed to create generation record" }, 500);
  }

  // ── Mark video as Processing ────────────────────────────────────────────────
  await admin.from("scene_image_productions").update({
    video_status: "Processing",
    video_generation_id: generationId,
    video_provider: "atlas",
    updated_at: new Date().toISOString(),
  }).eq("id", sceneProductionId);

  // ── Step 1: Create the Atlas Cloud video generation ────────────────────────
  const videoEndpoint = provider.video_generation_endpoint || "/api/v1/model/generateVideo";
  const generateUrl = resolveEndpoint(provider, videoEndpoint);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...buildAuthHeaders(provider),
  };

  let predictionId: string;
  try {
    const genRes = await fetch(generateUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!genRes.ok) {
      const text = await genRes.text().catch(() => "");
      throw new Error(`Atlas Cloud generateVideo failed (${genRes.status}): ${text.slice(0, 400)}`);
    }
    const genData = await genRes.json() as {
      data?: { id?: string; status?: string; error?: string };
      error?: string;
    };
    predictionId = genData.data?.id ?? "";
    if (!predictionId) {
      throw new Error(`Atlas Cloud generateVideo returned no prediction id: ${JSON.stringify(genData).slice(0, 400)}`);
    }
    await admin.from("generations").update({
      provider_generation_id: predictionId,
      status: "processing",
      started_at: new Date().toISOString(),
    }).eq("id", generationId);
  } catch (e) {
    const msg = (e as Error).message;
    await failGeneration(admin, generationId, "provider_call", msg);
    await admin.from("scene_image_productions").update({
      video_status: "Failed",
      updated_at: new Date().toISOString(),
    }).eq("id", sceneProductionId);
    return respond({ error: msg, generation_id: generationId }, 500);
  }

  // ── Step 2: Poll for completion (video can take up to 5 minutes) ───────────
  try {
    await pollAtlasCloudPrediction(provider, predictionId, 300_000);
  } catch (e) {
    const msg = (e as Error).message;
    // If the poll timed out or was interrupted (e.g. platform killed the
    // connection), the prediction may still be running on the provider.
    // Do NOT mark the video as Failed — leave it as Processing so the
    // resume-scene-video endpoint can pick it up and fetch the result.
    if (msg.includes("timed out") || msg.includes("timed out after")) {
      await admin.from("generations").update({
        status: "processing",
        error_message: msg,
      }).eq("id", generationId);
      return respond({
        success: false,
        still_processing: true,
        generation_id: generationId,
        message: "Video generation is still processing on the provider. It will be resumed automatically.",
      }, 202);
    }
    await failGeneration(admin, generationId, "poll", msg);
    await admin.from("scene_image_productions").update({
      video_status: "Failed",
      updated_at: new Date().toISOString(),
    }).eq("id", sceneProductionId);
    return respond({ error: msg, generation_id: generationId }, 500);
  }

  // ── Step 3: Fetch the result (contains output video URL) ───────────────────
  let videoDownloadUrl: string;
  try {
    videoDownloadUrl = await fetchAtlasCloudVideoResult(provider, predictionId);
  } catch (e) {
    const msg = (e as Error).message;
    await failGeneration(admin, generationId, "provider_call", msg);
    await admin.from("scene_image_productions").update({
      video_status: "Failed",
      updated_at: new Date().toISOString(),
    }).eq("id", sceneProductionId);
    return respond({ error: msg, generation_id: generationId }, 500);
  }

  // ── Step 4: Download the video and store it in Supabase storage ────────────
  let storedUrl: string;
  let videoAssetId = predictionId;
  try {
    const videoBytes = await downloadVideo(videoDownloadUrl);
    storedUrl = await storeVideo(videoBytes, "video/mp4", creatorId, generationId);
  } catch {
    storedUrl = videoDownloadUrl;
  }

  // ── Mark generation as completed ──────────────────────────────────────────
  await admin.from("generations").update({
    status: "completed",
    output_public_url: storedUrl,
    output_storage_bucket: "generation-outputs",
    output_storage_path: `${creatorId}/${generationId}.mp4`,
    completed_at: new Date().toISOString(),
  }).eq("id", generationId);

  // ── Update scene with generated video ─────────────────────────────────────
  await admin.from("scene_image_productions").update({
    video_url: storedUrl,
    video_asset_id: videoAssetId,
    video_status: "Ready",
    updated_at: new Date().toISOString(),
  }).eq("id", sceneProductionId);

  return respond({
    success: true,
    video_url: storedUrl,
    asset_id: videoAssetId,
    generation_id: generationId,
    status: "Ready",
  });
}

async function pollAtlasCloudPrediction(
  provider: ProviderConfig,
  predictionId: string,
  timeoutMs: number,
): Promise<void> {
  const statusPath = (provider.generation_status_endpoint ?? "/api/v1/model/prediction/{generation_id}")
    .replace("{generation_id}", predictionId)
    .replace("{prediction_id}", predictionId);
  const statusUrl = resolveEndpoint(provider, statusPath);
  const authHeaders = buildAuthHeaders(provider);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(statusUrl, {
      method: "GET",
      headers: authHeaders,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Atlas Cloud video poll failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = await res.json() as {
      data?: { status?: string; outputs?: string[]; error?: string };
    };
    const status = data.data?.status;
    if (status === "completed" || status === "succeeded") return;
    if (status === "failed") {
      throw new Error(`Atlas Cloud video generation failed: ${data.data?.error ?? "unknown error"}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Atlas Cloud video generation timed out after ${timeoutMs / 1000}s`);
}

async function fetchAtlasCloudVideoResult(
  provider: ProviderConfig,
  predictionId: string,
): Promise<string> {
  const resultPath = (provider.generation_result_endpoint ?? "/api/v1/model/result/{generation_id}")
    .replace("{generation_id}", predictionId)
    .replace("{request_id}", predictionId);
  const resultUrl = resolveEndpoint(provider, resultPath);
  const authHeaders = buildAuthHeaders(provider);

  const res = await fetch(resultUrl, {
    method: "GET",
    headers: authHeaders,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Atlas Cloud video result fetch failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const data = await res.json() as {
    data?: { outputs?: string[]; output?: string; url?: string };
  };
  const outputs = data.data?.outputs;
  if (outputs && outputs.length > 0) return outputs[0];
  const single = data.data?.output ?? data.data?.url;
  if (single) return single;
  throw new Error(`Atlas Cloud video result returned no output: ${JSON.stringify(data).slice(0, 400)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// ZENCREATOR — existing videogen flow (unchanged)
// ═══════════════════════════════════════════════════════════════════════════

async function generateZenCreatorVideo(
  admin: ReturnType<typeof createClient>,
  providerConfig: ProviderConfig,
  sceneProd: Record<string, unknown>,
  sceneProductionId: string,
  sceneImageUrl: string,
  creatorId: string,
): Promise<Response> {
  const videoModel: string = (sceneProd.video_model as string) || "wan@2.2";
  const videoDuration: number = (sceneProd.video_duration as number) ?? 5;
  const videoResolution: string = (sceneProd.video_resolution as string) || "720p";
  const videoGenerateAudio: boolean = (sceneProd.video_generate_audio as boolean) ?? true;
  const videoCameraFixed: boolean = (sceneProd.video_camera_fixed as boolean) ?? false;
  const videoPromptExtend: boolean = (sceneProd.video_prompt_extend as boolean) ?? false;
  const videoNegativePrompt: string = (sceneProd.video_negative_prompt as string) || "";
  const videoPrompt: string = (sceneProd.video_prompt as string) || "";

  // ── Step 1: Upload the scene image as a ZenCreator asset ──────────────────
  const refAssetId = await uploadZenCreatorAsset(providerConfig, sceneImageUrl);
  await admin.from("scene_image_productions").update({
    video_ref_asset_id: refAssetId,
    updated_at: new Date().toISOString(),
  }).eq("id", sceneProductionId);

  // ── Build the videogen input payload ─────────────────────────────────────
  const input: Record<string, unknown> = {
    ref_asset: refAssetId,
    model: videoModel,
    prompt: videoPrompt,
    duration: videoDuration,
    resolution: videoResolution,
    generate_audio: videoGenerateAudio,
    camera_fixed: videoCameraFixed,
    prompt_extend: videoPromptExtend,
  };
  if (videoNegativePrompt) input.negative_prompt = videoNegativePrompt;

  // ── Build the Generation Snapshot ────────────────────────────────────────
  const snapshot: GenerationSnapshot = {
    prompt: videoPrompt,
    renderTechnique: "videogen",
    inputAssets: {
      imageAssets: [sceneImageUrl],
    },
    providerParameters: {
      tool: "videogen",
      ...input,
    },
    providerMetadata: {
      scene_production_id: sceneProductionId,
      role_id: sceneProd.role_id as string,
      scene_id: sceneProd.scene_id as string,
      gen_tool: "videogen",
    },
  };

  // ── Create Generation record ─────────────────────────────────────────────
  const generationId = await createGeneration(admin, {
    creator_id: creatorId,
    asset_type: "video",
    asset_subtype: "scene",
    business_ref_type: "scene_image_productions",
    business_ref_id: sceneProductionId,
    provider_id: providerConfig.id,
    provider_name: providerConfig.provider_name,
    provider_model: "videogen",
    snapshot: snapshot as Record<string, unknown>,
    version: 1,
  });

  if (!generationId) {
    return respond({ error: "Failed to create generation record" }, 500);
  }

  // ── Mark video as Processing ────────────────────────────────────────────────
  await admin.from("scene_image_productions").update({
    video_status: "Processing",
    video_generation_id: generationId,
    updated_at: new Date().toISOString(),
  }).eq("id", sceneProductionId);

  // ── Step 2: Create the ZenCreator videogen generation ─────────────────────
  let genId: string;
  try {
    genId = await createZenCreatorGeneration(providerConfig, "videogen", input);
    await admin.from("generations").update({
      provider_generation_id: genId,
      status: "processing",
      started_at: new Date().toISOString(),
    }).eq("id", generationId);
  } catch (e) {
    const msg = (e as Error).message;
    await failGeneration(admin, generationId, "provider_call", msg);
    await admin.from("scene_image_productions").update({
      video_status: "Failed",
      updated_at: new Date().toISOString(),
    }).eq("id", sceneProductionId);
    return respond({ error: msg, generation_id: generationId }, 500);
  }

  // ── Step 3: Poll for completion (video can take up to 5 minutes) ───────────
  try {
    await pollZenCreatorGeneration(providerConfig, genId, 300_000);
  } catch (e) {
    const msg = (e as Error).message;
    // If the poll timed out or was interrupted, the generation may still be
    // running on the provider. Do NOT mark as Failed — leave as Processing
    // so resume-scene-video can pick it up.
    if (msg.includes("timed out") || msg.includes("timed out after")) {
      await admin.from("generations").update({
        status: "processing",
        error_message: msg,
      }).eq("id", generationId);
      return respond({
        success: false,
        still_processing: true,
        generation_id: generationId,
        message: "Video generation is still processing on the provider. It will be resumed automatically.",
      }, 202);
    }
    await failGeneration(admin, generationId, "poll", msg);
    await admin.from("scene_image_productions").update({
      video_status: "Failed",
      updated_at: new Date().toISOString(),
    }).eq("id", sceneProductionId);
    return respond({ error: msg, generation_id: generationId }, 500);
  }

  // ── Step 4: Fetch the result (contains asset_id + download_url directly) ────
  let videoAssetId: string;
  let videoDownloadUrl: string;
  try {
    const result = await fetchZenCreatorResult(providerConfig, genId);
    videoAssetId = result.videoAssetId;
    videoDownloadUrl = result.videoDownloadUrl;
  } catch (e) {
    const msg = (e as Error).message;
    await failGeneration(admin, generationId, "provider_call", msg);
    await admin.from("scene_image_productions").update({
      video_status: "Failed",
      updated_at: new Date().toISOString(),
    }).eq("id", sceneProductionId);
    return respond({ error: msg, generation_id: generationId }, 500);
  }

  // ── Step 5: Download the video and store it in Supabase storage ────────────
  let storedUrl: string;
  try {
    const videoBytes = await downloadVideo(videoDownloadUrl);
    storedUrl = await storeVideo(videoBytes, "video/mp4", creatorId, generationId);
  } catch {
    storedUrl = videoDownloadUrl;
  }

  // ── Mark generation as completed ──────────────────────────────────────────
  await admin.from("generations").update({
    status: "completed",
    output_public_url: storedUrl,
    output_storage_bucket: "generation-outputs",
    output_storage_path: `${creatorId}/${generationId}.mp4`,
    completed_at: new Date().toISOString(),
  }).eq("id", generationId);

  // ── Update scene with generated video ─────────────────────────────────────
  await admin.from("scene_image_productions").update({
    video_url: storedUrl,
    video_asset_id: videoAssetId,
    video_status: "Ready",
    updated_at: new Date().toISOString(),
  }).eq("id", sceneProductionId);

  return respond({
    success: true,
    video_url: storedUrl,
    asset_id: videoAssetId,
    generation_id: generationId,
    status: "Ready",
  });
}

// ── ZenCreator API helpers ──────────────────────────────────────────────────

async function uploadZenCreatorAsset(provider: ProviderConfig, imageUrl: string): Promise<string> {
  const baseUrl = normalizeBaseUrl(provider.provider_url);
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!imgRes.ok) throw new Error(`Failed to download scene image for upload: ${imageUrl} (${imgRes.status})`);
  const blob = await imgRes.blob();
  const contentType = imgRes.headers.get("content-type") ?? "image/png";
  const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
  const formData = new FormData();
  formData.append("file", blob, `upload.${ext}`);
  formData.append("media_type", contentType);

  const res = await fetch(`${baseUrl}/api/public/v1/assets`, {
    method: "POST",
    headers: { ...buildAuthHeaders(provider) },
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

async function createZenCreatorGeneration(
  provider: ProviderConfig,
  tool: string,
  input: Record<string, unknown>,
): Promise<string> {
  const baseUrl = normalizeBaseUrl(provider.provider_url);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    ...buildAuthHeaders(provider),
  };
  const res = await fetch(`${baseUrl}/api/public/v1/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tool, input }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ZenCreator videogen create failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const data = await res.json() as { id?: string; error?: { message?: string } | string };
  if (!data.id) {
    const errMsg = typeof data.error === "string" ? data.error : data.error?.message;
    throw new Error(`ZenCreator videogen returned no id: ${errMsg ?? JSON.stringify(data).slice(0, 400)}`);
  }
  return data.id;
}

async function pollZenCreatorGeneration(
  provider: ProviderConfig,
  genId: string,
  timeoutMs: number,
): Promise<void> {
  const baseUrl = normalizeBaseUrl(provider.provider_url);
  const headers: Record<string, string> = { ...buildAuthHeaders(provider) };
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${baseUrl}/api/public/v1/generations/${genId}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ZenCreator videogen poll failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = await res.json() as { status?: string; progress?: number; error?: string | null };
    if (data.status === "succeeded" || data.status === "completed") return;
    if (data.status === "failed" || data.status === "partial") {
      throw new Error(`ZenCreator videogen failed: ${data.error ?? "generation failed"}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`ZenCreator videogen timed out after ${timeoutMs / 1000}s`);
}

async function fetchZenCreatorResult(
  provider: ProviderConfig,
  genId: string,
): Promise<{ videoAssetId: string; videoDownloadUrl: string }> {
  const baseUrl = normalizeBaseUrl(provider.provider_url);
  const headers: Record<string, string> = { ...buildAuthHeaders(provider) };
  const res = await fetch(`${baseUrl}/api/public/v1/generations/${genId}/result`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ZenCreator videogen result fetch failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const data = await res.json() as {
    outputs?: { asset_id?: string; url?: string; download_url?: string }[];
  };

  if (!Array.isArray(data.outputs) || data.outputs.length === 0) {
    throw new Error(`ZenCreator videogen result returned no outputs: ${JSON.stringify(data).slice(0, 400)}`);
  }
  const out = data.outputs[0];
  if (!out.asset_id) {
    throw new Error(`ZenCreator videogen result output has no asset_id: ${JSON.stringify(out).slice(0, 400)}`);
  }
  const videoDownloadUrl = out.download_url ?? out.url;
  if (!videoDownloadUrl) {
    throw new Error(`ZenCreator videogen result output has no URL: ${JSON.stringify(out).slice(0, 400)}`);
  }
  return { videoAssetId: out.asset_id, videoDownloadUrl };
}

// ── Storage helpers ───────────────────────────────────────────────────────────

async function downloadVideo(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Failed to download video: ${res.status} ${res.statusText}`);
  return await res.arrayBuffer();
}

async function storeVideo(
  videoBytes: ArrayBuffer,
  contentType: string,
  creatorId: string,
  generationId: string,
): Promise<string> {
  const storagePath = `${creatorId}/${generationId}.mp4`;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error: uploadErr } = await admin.storage
    .from("generation-outputs")
    .upload(storagePath, videoBytes, { contentType, upsert: true });
  if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);
  const { data: urlData } = admin.storage.from("generation-outputs").getPublicUrl(storagePath);
  return urlData.publicUrl;
}
