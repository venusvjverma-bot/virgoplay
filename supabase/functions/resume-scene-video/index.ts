import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  loadProviderConfig,
  buildAuthHeaders,
  normalizeBaseUrl,
  resolveEndpoint,
} from "../_shared/generation-provider.ts";
import type { ProviderConfig } from "../_shared/generation-types.ts";

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

    // Only resume if video is stuck in Processing
    if (sceneProd.video_status !== "Processing") {
      // Already done or not started — return current state
      return respond({
        success: true,
        video_url: sceneProd.video_url,
        video_status: sceneProd.video_status,
        skipped: true,
      });
    }

    const generationId = sceneProd.video_generation_id as string | null;
    if (!generationId) {
      return respond({ error: "No generation record linked to this scene — cannot resume." }, 422);
    }

    // ── Load the generation record to get the provider generation ID ───────────
    const { data: genRecord, error: genErr } = await admin
      .from("generations")
      .select("id, provider_generation_id, provider_name, status")
      .eq("id", generationId)
      .maybeSingle();

    if (genErr || !genRecord) {
      return respond({ error: "Generation record not found." }, 404);
    }

    const providerGenId = genRecord.provider_generation_id as string | null;
    if (!providerGenId) {
      return respond({ error: "No provider generation ID — cannot resume." }, 422);
    }

    // ── Load the active IMAGE provider (same as generate-scene-video) ──────────
    const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
    if (!providerConfig) {
      return respond({ error: "No active image provider configured." }, 422);
    }

    const providerName = providerConfig.provider_name.toLowerCase();
    const isAtlasCloud = providerName.includes("atlas");
    const isZenCreator = providerName.includes("zencreator");

    if (!isAtlasCloud && !isZenCreator) {
      return respond({ error: "Video resume requires ZenCreator or Atlas Cloud as the active provider." }, 422);
    }

    const videoProvider: string = sceneProd.video_provider || "zencreator";
    const useAtlas = isAtlasCloud || videoProvider === "atlas";

    // ── Poll the provider for completion (up to 4 minutes) ──────────────────────
    let videoDownloadUrl: string;
    let videoAssetId: string = providerGenId;

    if (useAtlas) {
      try {
        await pollAtlasCloud(providerConfig, providerGenId, 240_000);
        videoDownloadUrl = await fetchAtlasCloudResult(providerConfig, providerGenId);
      } catch (e) {
        const msg = (e as Error).message;
        // If the provider says it's still processing, return a "still processing" response
        if (msg.includes("timed out") || msg.includes("still processing")) {
          return respond({ success: false, still_processing: true, message: msg }, 202);
        }
        await admin.from("generations").update({
          status: "failed",
          failed_at_step: "resume_poll",
          error_message: msg,
          completed_at: new Date().toISOString(),
        }).eq("id", generationId);
        await admin.from("scene_image_productions").update({
          video_status: "Failed",
          updated_at: new Date().toISOString(),
        }).eq("id", sceneProductionId);
        return respond({ error: msg, generation_id: generationId }, 500);
      }
    } else {
      // ZenCreator
      try {
        await pollZenCreator(providerConfig, providerGenId, 240_000);
        const result = await fetchZenCreatorResult(providerConfig, providerGenId);
        videoAssetId = result.videoAssetId;
        videoDownloadUrl = result.videoDownloadUrl;
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("timed out") || msg.includes("still processing")) {
          return respond({ success: false, still_processing: true, message: msg }, 202);
        }
        await admin.from("generations").update({
          status: "failed",
          failed_at_step: "resume_poll",
          error_message: msg,
          completed_at: new Date().toISOString(),
        }).eq("id", generationId);
        await admin.from("scene_image_productions").update({
          video_status: "Failed",
          updated_at: new Date().toISOString(),
        }).eq("id", sceneProductionId);
        return respond({ error: msg, generation_id: generationId }, 500);
      }
    }

    // ── Download and store the video ──────────────────────────────────────────
    let storedUrl: string;
    try {
      const videoBytes = await downloadVideo(videoDownloadUrl);
      storedUrl = await storeVideo(videoBytes, "video/mp4", creatorId, generationId);
    } catch {
      storedUrl = videoDownloadUrl;
    }

    // ── Mark generation as completed ───────────────────────────────────────────
    await admin.from("generations").update({
      status: "completed",
      output_public_url: storedUrl,
      output_storage_bucket: "generation-outputs",
      output_storage_path: `${creatorId}/${generationId}.mp4`,
      completed_at: new Date().toISOString(),
    }).eq("id", generationId);

    // ── Update scene with generated video ──────────────────────────────────────
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
  } catch (err) {
    return respond({ error: (err as Error).message }, 500);
  }
});

// ── Atlas Cloud helpers ───────────────────────────────────────────────────────

async function pollAtlasCloud(
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

async function fetchAtlasCloudResult(
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

// ── ZenCreator helpers ─────────────────────────────────────────────────────────

async function pollZenCreator(
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
