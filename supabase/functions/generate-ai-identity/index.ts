import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createGeneration } from "../_shared/generation-lifecycle.ts";
import { loadProviderConfig } from "../_shared/generation-provider.ts";
import { imageWorker } from "../_shared/image-worker.ts";
import type {
  GenerationSnapshot,
  ProviderConfig,
} from "../_shared/generation-types.ts";

// ── AI IDENTITY GENERATION PIPELINE (Generation Engine V2) ───────────────────
//
//   Step 1 │ Master AI Identity     — container (master_ai_identities)
//   Step 2 │ Canonical Body Asset   — AI-XXXX-A  (ai_identity_layers, is_canonical_body=true)
//   Step 3 │ Base Clothing          — AI-XXXX-B  (ai_identity_layers, layer_type=base_clothing)
//   Step 4 │ Dress Layer            — DR-*        (future)
//   Step 5 │ Accessory Layer        — ACC-*       (future)
//   Step 6 │ Role Blueprint         — MT-001 etc. (future)
//   Step 7 │ Generation Engine      — immutable snapshot → generation record → image worker
//   Step 8 │ Final Asset            — stored in master-ai-identities bucket

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUCKET = "master-ai-identities";

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Skin tone → APR code mapping ──────────────────────────────────────────────
const SKIN_TONE: Record<string, string> = {
  "APR-001": "Light, warm ivory — East Asian Japanese complexion",
  "APR-002": "Light, cool porcelain — East Asian Korean complexion",
  "APR-003": "Light to medium, warm beige — East Asian Chinese complexion",
  "APR-004": "Light, neutral fair — Western American complexion",
  "APR-005": "Light, cool rose-beige — Eastern European Russian complexion",
  "APR-006": "Medium to dark, warm golden-brown — South Asian Indian complexion",
  "APR-007": "Medium to deep, rich brown — African American complexion",
  "APR-008": "Creator-defined — populated when custom APR is configured",
};

// ── Body proportions → BT code mapping ───────────────────────────────────────
const BT_PROFILE: Record<string, {
  height: string;
  proportions: { frame: string; shoulders: string; waist: string; hips: string; posture: string };
}> = {
  "BT-001": { height: "Medium to tall",    proportions: { frame: "Slim elongated",       shoulders: "Narrow",        waist: "Slim",          hips: "Narrow to slim",   posture: "Upright lean"    } },
  "BT-002": { height: "Medium",            proportions: { frame: "Athletic muscular",     shoulders: "Broad defined", waist: "Narrow defined", hips: "Athletic firm",    posture: "Strong upright"  } },
  "BT-003": { height: "Medium",            proportions: { frame: "Full hourglass curves", shoulders: "Medium",        waist: "Defined narrow", hips: "Full wide",        posture: "Natural relaxed" } },
  "BT-004": { height: "Short to medium",   proportions: { frame: "Petite compact",        shoulders: "Narrow petite", waist: "Slim narrow",    hips: "Petite",           posture: "Light upright"   } },
  "BT-005": { height: "Medium to tall",    proportions: { frame: "Full plus-size",        shoulders: "Full wide",     waist: "Full soft",      hips: "Full wide",        posture: "Natural confident"} },
};

// ── Store composed preview ────────────────────────────────────────────────────
async function storePreview(
  generatedUrl: string,
  storagePath:  string,
  supabaseUrl:  string,
  serviceKey:   string,
): Promise<string> {
  const imgRes = await fetch(generatedUrl);
  if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);

  const bytes = await imgRes.arrayBuffer();
  const ct    = imgRes.headers.get("content-type") ?? "image/jpeg";
  const ext   = ct.includes("webp") ? "webp" : ct.includes("png") ? "png" : "jpg";
  const path  = `${storagePath}.${ext}`;

  const admin = createClient(supabaseUrl, serviceKey);
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: ct, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path);
  return publicUrl;
}

// ── Build Canonical Body Asset metadata ──────────────────────────────────────
function buildBodyAssetMetadata(params: {
  identityCode: string;
  aprCode:      string;
  aprName:      string;
  btCode:       string;
  btName:       string;
  aprImgUrl:    string;
  btImgUrl:     string;
  layerCode:    string;
  now:          string;
}) {
  const { identityCode, aprCode, aprName, btCode, btName, aprImgUrl, btImgUrl, layerCode, now } = params;
  const btProfile   = BT_PROFILE[btCode] ?? BT_PROFILE["BT-001"];
  const skinTone    = SKIN_TONE[aprCode]  ?? "Unspecified";

  return {
    canonical:          true,
    body_asset_version: 1,
    role: "Permanent body asset for this identity. Every image, video, animation, package, and role appearance must originate from this body definition. Body geometry is never recreated independently once this layer exists.",

    identity: {
      identity_code:   identityCode,
      linked_apr_code: aprCode,
      linked_apr_name: aprName,
      linked_bt_code:  btCode,
      linked_bt_name:  btName,
      version:         1,
    },

    physical_profile: {
      body_type:   btName,
      skin_tone:   skinTone,
      height:      btProfile.height,
      proportions: btProfile.proportions,
      creator_age: null,
    },

    generation_pipeline: {
      position:           1,
      is_canonical_body:  true,
      provider_independent: true,
      provider_note:      "Body definition is rendering-provider agnostic. Compatible with FAL, Stable Diffusion, ComfyUI, and any future AI rendering system.",
      description:        "Step 1 of every generation pipeline. All images, videos, animations, packages, and role appearances start from this body asset.",
      pipeline: [
        { step: 1, type: "identity",  code: identityCode,        label: "Master AI Identity",   role: "Identity container and reference point"                                 },
        { step: 2, type: "body",      code: layerCode,            label: "Canonical Body Asset", role: "THIS LAYER — permanent body definition. Never regenerated independently." },
        { step: 3, type: "clothing",  code: `${identityCode}-B`,  label: "Base Clothing",        role: "Default clothing — replaceable without touching the body asset"          },
        { step: 4, type: "dress",     code: "DR-*",               label: "Dress Layer",          role: "Role-specific or custom outfit from Dress Library"                       },
        { step: 5, type: "accessory", code: "ACC-*",              label: "Accessory Layer",      role: "Watch, jewellery, eyewear, badge — independent from all other layers"    },
        { step: 6, type: "blueprint", code: "MT-001 / GF-001 …",  label: "Role Blueprint",       role: "Environment, camera angle, pose, lighting, expression"                   },
        { step: 7, type: "provider",  code: "fal-ai | SD | …",    label: "Rendering Provider",   role: "Receives composed appearance definition and renders the final image"      },
        { step: 8, type: "output",    code: null,                 label: "Final Asset",          role: "Generated image or video output"                                         },
      ],
    },

    source: {
      bt_image_url:  btImgUrl,
      apr_image_url: aprImgUrl,
      composition_technique: "face_swap_v1",
      phase: 1,
      note: "Body asset represents body geometry and proportions only. Role clothing is defined by Dress Library layers, not embedded here.",
    },

    timestamps: {
      created_at: now,
      updated_at: now,
    },
  };
}

// ── Build Base Clothing metadata ──────────────────────────────────────────────
function buildClothingMetadata(params: {
  identityCode: string;
  btCode:       string;
  btName:       string;
  btImgUrl:     string;
}) {
  const { identityCode, btCode, btName, btImgUrl } = params;
  return {
    canonical:             false,
    clothing_layer_version: 1,
    role: "Default clothing from BT preset reference. Fully independent from the body asset. Replace, recolour, or delete without modifying the Canonical Body Asset.",
    identity: {
      identity_code:  identityCode,
      linked_bt_code: btCode,
      linked_bt_name: btName,
    },
    replaceability: {
      colour_change:   true,
      texture_change:  true,
      material_change: true,
      replacement:     true,
      deletion:        true,
      note:            "Any clothing change must never regenerate the Canonical Body Asset (AI-XXXX-A).",
    },
    source: {
      bt_image_url: btImgUrl,
      clothing_ref: "Default clothing worn in BT preset reference image",
      phase:        1,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return respond({ error: "Unauthorized. Valid JWT required." }, 401);
  const creatorId = user.id;

  // ── Parse input ────────────────────────────────────────────────────────────
  let aprCode = "", btCode = "";
  try {
    const body = await req.json();
    aprCode = body.apr_code ?? "";
    btCode  = body.bt_code  ?? "";
  } catch {
    return respond({ error: "Request body must be JSON with apr_code and bt_code." }, 400);
  }
  if (!aprCode || !btCode) {
    return respond({ error: "Both apr_code and bt_code are required." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // ── 1. Resolve layer source assets �─────────────────────────────────────────
  const [faceRes, bodyRes] = await Promise.all([
    admin.from("engine_appearance_preset_assets")
      .select("preset_name, image_url").eq("preset_id", aprCode).maybeSingle(),
    admin.from("engine_body_type_preset_assets")
      .select("body_type_name, image_url").eq("preset_id", btCode).maybeSingle(),
  ]);
  if (!faceRes.data?.image_url) {
    return respond({ error: `APR preset ${aprCode} not found or has no image.` }, 422);
  }
  if (!bodyRes.data?.image_url) {
    return respond({ error: `BT preset ${btCode} not found or has no image.` }, 422);
  }
  const faceAsset = faceRes.data;
  const bodyAsset = bodyRes.data;

  // ── 2. Allocate identity_code ───────────────────────────────────────────────
  const { count } = await admin
    .from("master_ai_identities")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creatorId);
  const identityCode = `AI-${String((count ?? 0) + 1).padStart(4, "0")}`;
  const bodyLayerCode     = `${identityCode}-A`;
  const clothingLayerCode = `${identityCode}-B`;
  const now               = new Date().toISOString();

  // ── 3. Create master identity record (processing) ───────────────────────────
  const { data: identityRecord, error: insertErr } = await admin
    .from("master_ai_identities")
    .insert({
      creator_id:        creatorId,
      identity_code:     identityCode,
      apr_code:          aprCode,
      apr_name:          faceAsset.preset_name,
      bt_code:           btCode,
      bt_name:           bodyAsset.body_type_name,
      generation_status: "processing",
      updated_at:        now,
    })
    .select()
    .single();

  if (insertErr) {
    return respond({ error: `DB insert failed: ${insertErr.message}` }, 500);
  }

  const identityId  = identityRecord.id;
  const storagePath = `${creatorId}/${identityCode}`;

  // ── 4. Create Canonical Body Asset + Base Clothing layers ────────────────────
  const bodyMeta = buildBodyAssetMetadata({
    identityCode,
    aprCode,
    aprName:   faceAsset.preset_name,
    btCode,
    btName:    bodyAsset.body_type_name,
    aprImgUrl: faceAsset.image_url,
    btImgUrl:  bodyAsset.image_url,
    layerCode: bodyLayerCode,
    now,
  });

  const clothingMeta = buildClothingMetadata({
    identityCode,
    btCode,
    btName:   bodyAsset.body_type_name,
    btImgUrl: bodyAsset.image_url,
  });

  await admin.from("ai_identity_layers").upsert([
    {
      identity_id:      identityId,
      creator_id:       creatorId,
      layer_code:       bodyLayerCode,
      layer_type:       "body",
      layer_name:       `Canonical Body Asset — ${bodyAsset.body_type_name}`,
      source_ref:       btCode,
      layer_status:     "canonical",
      is_canonical_body: true,
      metadata:         bodyMeta,
      sort_order:       1,
    },
    {
      identity_id:  identityId,
      creator_id:   creatorId,
      layer_code:   clothingLayerCode,
      layer_type:   "base_clothing",
      layer_name:   `Base Clothing — ${bodyAsset.body_type_name} default`,
      source_ref:   btCode,
      layer_status: "reference_only",
      metadata:     clothingMeta,
      sort_order:   2,
    },
  ], { onConflict: "identity_id,layer_code" });

  // ── 5. Build immutable Generation Snapshot ───────────────────────────────────
  // The worker's callAdapter detects faceImageUrl + bodyImageUrl and routes to
  // adapter.faceSwap() automatically.
  const snapshot: GenerationSnapshot = {
    prompt: "Face swap composition: APR face onto BT body reference.",
    inputAssets: {
      faceImageUrl: faceAsset.image_url,
      bodyImageUrl: bodyAsset.image_url,
    },
    identityContext: {
      identityId,
      identityCode,
      aprCode,
      aprName: faceAsset.preset_name,
      btCode,
      btName:  bodyAsset.body_type_name,
    },
    providerMetadata: {
      identity_id:    identityId,
      identity_code:  identityCode,
      apr_code:       aprCode,
      bt_code:        btCode,
      composition_technique: "face_swap_v1",
    },
  };

  // ── Resolve provider config ─────────────────────────────────────────────────
  const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
  if (!providerConfig) {
    await admin.from("master_ai_identities").update({
      generation_status: "failed",
      error_message:     "No image provider configured",
      updated_at:        now,
    }).eq("id", identityId);
    return respond({ error: "No image provider configured. Add one in the Provider Configuration page." }, 422);
  }

  // ── Create Generation record ────────────────────────────────────────────────
  const generationId = await createGeneration(admin, {
    creator_id: creatorId,
    asset_type: "image",
    asset_subtype: "character_identity",
    business_ref_type: "master_ai_identities",
    business_ref_id: identityId,
    provider_id: providerConfig.id,
    provider_name: providerConfig.provider_name,
    provider_model: providerConfig.generation_endpoint || undefined,
    snapshot: snapshot as Record<string, unknown>,
  });

  if (!generationId) {
    await admin.from("master_ai_identities").update({
      generation_status: "failed",
      error_message:     "Failed to create generation record",
      updated_at:        now,
    }).eq("id", identityId);
    return respond({ error: "Failed to create generation record" }, 500);
  }

  // ── 6. Execute image worker ──────────────────────────────────────────────────
  let previewUrl: string;
  try {
    const result = await imageWorker.execute({ generationId, snapshot, providerConfig });

    if (result.status !== "completed" || !result.outputUrl) {
      throw new Error(result.error ?? "Generation failed");
    }

    // Copy from generation-outputs to master-ai-identities bucket
    previewUrl = await storePreview(result.outputUrl, storagePath, supabaseUrl, serviceKey);
  } catch (e) {
    const msg = (e as Error).message;
    await admin.from("master_ai_identities").update({
      generation_status: "failed",
      error_message:     msg,
      updated_at:        now,
    }).eq("id", identityId);

    await admin.from("ai_identity_layers").update({
      layer_status: "failed",
      updated_at:   now,
    }).eq("identity_id", identityId);

    return respond({
      error:         "Render failed.",
      detail:        msg,
      identity_code: identityCode,
      record_id:     identityId,
      diagnosis: msg.includes("No face found")
        ? `${btCode} body reference has no detectable face. Try a different BT preset.`
        : "Unexpected error from image provider. Verify the provider configuration is correct and that both source images are accessible.",
    }, 500);
  }

  // ── 7. Mark identity completed ─────────────────────────────────────────────
  await admin.from("master_ai_identities").update({
    generation_status:    "completed",
    composed_preview_url: previewUrl,
    storage_path:         storagePath,
    error_message:        null,
    updated_at:           now,
  }).eq("id", identityId);

  // ── 8. Persist selections to AP-001 ─────────────────────────────────────────
  await admin.from("creator_appearance_profiles").update({
    appearance_preset_id: aprCode,
    body_preset_id:       btCode,
    updated_at:           now,
  }).eq("creator_id", creatorId).eq("profile_code", "AP-001");

  return respond({
    status:              "success",
    identity_code:       identityCode,
    record_id:           identityId,
    apr:  { code: aprCode, name: faceAsset.preset_name },
    bt:   { code: btCode,  name: bodyAsset.body_type_name },
    composed_preview_url: previewUrl,
    layers: [
      {
        code:              bodyLayerCode,
        type:              "body",
        status:            "canonical",
        is_canonical_body: true,
        source:            btCode,
        skin_tone:         SKIN_TONE[aprCode] ?? "Unspecified",
        height:            BT_PROFILE[btCode]?.height ?? "Medium",
        frame:             BT_PROFILE[btCode]?.proportions.frame ?? "Standard",
      },
      {
        code:   clothingLayerCode,
        type:   "base_clothing",
        status: "reference_only",
        source: btCode,
      },
    ],
    bucket:       BUCKET,
    storage_path: storagePath,
    generation_id: generationId,
    pipeline_note: "Layers 4–6 (Dress / Accessory / Role Blueprint) are architecturally ready and will be activated in Phase 2.",
  });
});
