import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createGeneration } from "../_shared/generation-lifecycle.ts";
import { loadProviderConfig } from "../_shared/generation-provider.ts";
import { imageWorker } from "../_shared/image-worker.ts";
import type {
  GenerationSnapshot,
  ProviderConfig,
} from "../_shared/generation-types.ts";

// ── FACE-BODY COMPOSE TEST (Generation Engine V2) ─────────────────────────────
//
// Diagnostic function: face-swap an APR face preset onto a BT body preset.
// The worker detects inputAssets.faceImageUrl + inputAssets.bodyImageUrl and
// routes to adapter.faceSwap() automatically.
//
// No auth — this is a platform diagnostic tool.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUCKET = "identity-composition-tests";

// Super admin creator used for platform-level diagnostic generations.
const PLATFORM_CREATOR_ID = "81037345-2a1b-4242-952d-d5087b737c27";

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function storeResult(
  generatedUrl: string,
  filename:      string,
  supabaseUrl:   string,
  serviceKey:    string,
): Promise<string> {
  const imgRes = await fetch(generatedUrl);
  if (!imgRes.ok) throw new Error(`Image download failed (${imgRes.status})`);

  const bytes = await imgRes.arrayBuffer();
  const ct    = imgRes.headers.get("content-type") ?? "image/jpeg";
  const ext   = ct.includes("webp") ? "webp" : ct.includes("png") ? "png" : "jpg";
  const path  = `${filename}.${ext}`;

  const admin = createClient(supabaseUrl, serviceKey);
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: ct, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path);
  return publicUrl;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Resolve provider config via the Generation Engine loader ──────────────
  const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
  if (!providerConfig) {
    return respond({ error: "No image provider configured. Add one in the Provider Configuration page." }, 422);
  }

  // ── Parse params (defaults: APR-003 + BT-003) ──────────────────────────────
  let facePresetId = "APR-003";
  let bodyPresetId = "BT-003";
  try {
    const body = await req.json();
    if (body.face_preset_id) facePresetId = body.face_preset_id;
    if (body.body_preset_id) bodyPresetId = body.body_preset_id;
  } catch { /* use defaults */ }

  const admin = createClient(supabaseUrl, serviceKey);

  // ── 1. Fetch face preset (APR) ─────────────────────────────────────────────
  const { data: facePreset, error: fErr } = await admin
    .from("engine_appearance_preset_assets")
    .select("preset_id, preset_name, image_url")
    .eq("preset_id", facePresetId)
    .maybeSingle();

  if (fErr || !facePreset?.image_url) {
    return respond({
      error: `Face preset ${facePresetId} not found or has no image.`,
      tip: "Seed face presets first via /seed-appearance-previews.",
    }, 422);
  }

  // ── 2. Fetch body preset (BT) ──────────────────────────────────────────────
  const { data: bodyPreset, error: bErr } = await admin
    .from("engine_body_type_preset_assets")
    .select("preset_id, body_type_name, image_url")
    .eq("preset_id", bodyPresetId)
    .maybeSingle();

  if (bErr || !bodyPreset?.image_url) {
    return respond({
      error: `Body preset ${bodyPresetId} not found or has no image.`,
      tip: "Seed body presets first via /seed-body-type-previews.",
    }, 422);
  }

  // ── 3. Build immutable Generation Snapshot ──────────────────────────────────
  // Worker detects faceImageUrl + bodyImageUrl → routes to adapter.faceSwap().
  const snapshot: GenerationSnapshot = {
    prompt: "Face swap composition: APR face onto BT body reference.",
    inputAssets: {
      faceImageUrl: facePreset.image_url,
      bodyImageUrl:  bodyPreset.image_url,
    },
    providerMetadata: {
      face_preset_id: facePresetId,
      body_preset_id: bodyPresetId,
      composition_technique: "face_swap",
    },
  };

  // ── 4. Create Generation record ─────────────────────────────────────────────
  const generationId = await createGeneration(admin, {
    creator_id: PLATFORM_CREATOR_ID,
    asset_type: "face_swap",
    asset_subtype: "character_identity",
    business_ref_type: "engine_appearance_preset_assets",
    provider_id: providerConfig.id,
    provider_name: providerConfig.provider_name,
    provider_model: providerConfig.generation_endpoint || undefined,
    snapshot: snapshot as Record<string, unknown>,
  });

  if (!generationId) {
    return respond({ error: "Failed to create generation record" }, 500);
  }

  // ── 5. Execute image worker (face-swap) ──────────────────────────────────────
  let resultUrl: string;
  try {
    const result = await imageWorker.execute({ generationId, snapshot, providerConfig });

    if (result.status !== "completed" || !result.outputUrl) {
      throw new Error(result.error ?? "Generation failed");
    }

    // Copy from generation-outputs to identity-composition-tests bucket
    resultUrl = await storeResult(result.outputUrl, `${bodyPresetId}-${facePresetId}-compose-test`, supabaseUrl, serviceKey);
  } catch (e) {
    const msg = (e as Error).message;
    return respond({
      error:             "Face-swap failed.",
      detail:            msg,
      face_preset_id:    facePresetId,
      face_preset_name:  facePreset.preset_name,
      face_source_url:   facePreset.image_url,
      body_preset_id:    bodyPresetId,
      body_preset_name:  bodyPreset.body_type_name,
      body_source_url:   bodyPreset.image_url,
      diagnosis:         msg.includes("No face found")
        ? "BT body image has no detectable face. The face-swap model needs a face in the base image to replace. Try using a full-body shot that includes a face."
        : "Unexpected error from image provider. Verify the provider configuration is correct and source image accessibility.",
    }, 500);
  }

  // ── 6. Return structured result ─────────────────────────────────────────────
  return respond({
    status: "success",

    technique: "face_swap",
    technique_label: "(b) Face swap — APR face region transplanted onto BT body scene",
    technique_notes: [
      "BT clothing and body proportions are preserved exactly.",
      "APR face region replaces the existing face in the BT image.",
      "Neck/chest skin tone blending is handled automatically by the model.",
      "Hairstyle from APR portrait may or may not survive depending on how the model treats hair.",
      "This is NOT true segmentation-based composition (a) nor full image regeneration (c).",
    ],

    face_preset: {
      id:        facePreset.preset_id,
      name:      facePreset.preset_name,
      image_url: facePreset.image_url,
    },
    body_preset: {
      id:        bodyPreset.preset_id,
      name:      bodyPreset.body_type_name,
      image_url: bodyPreset.image_url,
    },

    result: {
      image_url:    resultUrl,
      bucket:       BUCKET,
      storage_path: `${bodyPresetId}-${facePresetId}-compose-test`,
    },

    generation_id: generationId,

    review_checklist: [
      "Face preservation accuracy: does APR face identity appear in result?",
      "Skin tone matching: is neck/chest blended to face skin tone?",
      "Neck blending quality: visible seam or natural transition?",
      "Hair consistency: APR hair or BT hair in result?",
      "Clothing preservation: does BT outfit appear unchanged?",
      "Body proportions: does BT body shape remain?",
      "Overall realism: does the combined result look photorealistic?",
    ],
  });
});
