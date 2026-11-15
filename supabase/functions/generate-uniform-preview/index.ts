import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createGeneration } from "../_shared/generation-lifecycle.ts";
import { loadProviderConfig } from "../_shared/generation-provider.ts";
import { imageWorker } from "../_shared/image-worker.ts";
import type {
  GenerationSnapshot,
  ProviderConfig,
} from "../_shared/generation-types.ts";

// ── DRESS ASSET GENERATION PIPELINE (Generation Engine V2) ───────────────────
//
// Generates a standalone Dress Layer asset image — the garment displayed on an
// invisible mannequin form, no human anatomy, no face, no hair.
//
// The generated image is stored in two places:
//   1. ai_dress_library.image_url   — canonical shared dress asset (service key)
//   2. creator_uniform_library      — per-creator version tracking and notes
//
// Generation steps:
//   Step 1 │ Auth           — validate JWT, extract creator_id
//   Step 2 │ Dress          — fetch from ai_dress_library, must be active
//   Step 3 │ Prompt         — build garment-only text-to-image prompt
//   Step 4 │ Mark status    — upsert creator_uniform_library as "generating"
//   Step 5 │ Generation     — build snapshot → create record → execute worker
//   Step 6 │ Store          — copy output to uniform-previews bucket
//   Step 7 │ Persist        — update canonical image_url + creator record

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ASSET_BUCKET = "uniform-previews";

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildGarmentPrompt(dress: {
  dress_name: string;
  garment_type: string | null;
  generation_prompt_fragment: string | null;
  metadata: Record<string, unknown>;
}): string {
  const meta = dress.metadata ?? {};
  const parts: string[] = [];

  parts.push("Professional product photography, invisible mannequin technique");

  const garmentType = dress.garment_type ?? dress.dress_name;
  parts.push(garmentType);

  if (meta.primary_color)  parts.push(`${meta.primary_color}`);
  if (meta.fabric)         parts.push(`${meta.fabric}`);
  if (meta.texture)        parts.push(`${meta.texture} texture`);
  if (meta.neckline)       parts.push(`${meta.neckline} neckline`);
  if (meta.collar)         parts.push(`${meta.collar}`);
  if (meta.sleeves)        parts.push(`${meta.sleeves} sleeves`);
  if (meta.length)         parts.push(`${meta.length} length`);
  if (meta.fit)            parts.push(`${meta.fit} fit`);
  if (meta.waist_style)    parts.push(`${meta.waist_style} waist`);
  if (meta.pockets)        parts.push(`${meta.pockets} pockets`);

  if (dress.generation_prompt_fragment) {
    parts.push(dress.generation_prompt_fragment);
  }

  parts.push(
    "clean white studio background",
    "soft even studio lighting",
    "fashion product photography",
    "high resolution sharp fabric detail",
    "no person, no face, no hands, no skin, no hair, no anatomy, garment only",
  );

  return parts.join(", ");
}

async function copyToBucket(
  sourceUrl:   string,
  storagePath: string,
  supabaseUrl: string,
  serviceKey:  string,
): Promise<string> {
  const imgRes = await fetch(sourceUrl);
  if (!imgRes.ok) throw new Error(`Asset download failed (${imgRes.status})`);

  const bytes = await imgRes.arrayBuffer();
  const ct    = imgRes.headers.get("content-type") ?? "image/jpeg";
  const ext   = ct.includes("webp") ? "webp" : ct.includes("png") ? "png" : "jpg";
  const path  = `${storagePath}.${ext}`;

  const admin = createClient(supabaseUrl, serviceKey);
  await admin.storage.createBucket(ASSET_BUCKET, { public: true }).catch(() => {});

  const { error } = await admin.storage.from(ASSET_BUCKET).upload(path, bytes, {
    contentType: ct,
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: { publicUrl } } = admin.storage.from(ASSET_BUCKET).getPublicUrl(path);
  return publicUrl;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Step 1: Auth ───────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return respond({ error: "Unauthorized. Valid JWT required." }, 401);
  const creatorId = user.id;

  // ── Parse input ────────────────────────────────────────────────────────────
  let dressId: string;
  try {
    const body = await req.json();
    dressId    = body.dress_id ?? "";
  } catch {
    return respond({ error: "Request body must be valid JSON." }, 400);
  }
  if (!dressId) return respond({ error: "Required: dress_id." }, 400);

  const admin = createClient(supabaseUrl, serviceKey);
  const now   = new Date().toISOString();

  // ── Step 2: Fetch dress ────────────────────────────────────────────────────
  const { data: dress } = await admin
    .from("ai_dress_library")
    .select("id, dress_code, dress_name, category, role_code, garment_type, generation_prompt_fragment, metadata, is_active")
    .eq("id", dressId)
    .eq("is_active", true)
    .maybeSingle();

  if (!dress) {
    return respond({ error: "Dress not found or is inactive.", step_failed: 2 }, 404);
  }

  // ── Step 3: Build prompt ───────────────────────────────────────────────────
  const prompt = buildGarmentPrompt(dress);

  // ── Step 4: Mark generating ────────────────────────────────────────────────
  const { data: existing } = await admin
    .from("creator_uniform_library")
    .select("version")
    .eq("creator_id", creatorId)
    .eq("dress_id", dressId)
    .maybeSingle();

  const nextVersion = (existing?.version ?? 0) + 1;

  await admin.from("creator_uniform_library").upsert({
    creator_id:            creatorId,
    dress_id:              dressId,
    master_ai_identity_id: null,
    version:               nextVersion,
    generation_status:     "generating",
    error_message:         null,
    render_base:           "text_to_image",
    updated_at:            now,
    metadata: {
      generation_technique: "text_to_image",
      dress_code:           dress.dress_code,
      dress_name:           dress.dress_name,
      category:             dress.category,
      garment_type:         dress.garment_type,
      prompt_preview:       prompt.slice(0, 200),
    },
  }, { onConflict: "creator_id,dress_id" });

  // ── Step 5: Build snapshot → create record → execute worker ────────────────
  const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
  if (!providerConfig) {
    return respond({ error: "No image provider configured. Add one in the Provider Configuration page." }, 422);
  }

  const snapshot: GenerationSnapshot = {
    prompt,
    providerParameters: {
      outputFormat: "jpeg",
      imageSize:    "portrait_4_3",
    },
    dressContext: {
      dressId:   dress.id,
      dressCode: dress.dress_code,
      dressName: dress.dress_name,
      dressPromptFragment: dress.generation_prompt_fragment,
    },
    providerMetadata: {
      dress_id:      dress.id,
      dress_code:    dress.dress_code,
      dress_name:    dress.dress_name,
      category:      dress.category,
      garment_type:  dress.garment_type,
      prompt_preview: prompt.slice(0, 200),
    },
  };

  const generationId = await createGeneration(admin, {
    creator_id: creatorId,
    asset_type: "image",
    asset_subtype: "uniform",
    business_ref_type: "creator_uniform_library",
    business_ref_id: undefined, // composite key (creator_id + dress_id), not a single UUID
    provider_id: providerConfig.id,
    provider_name: providerConfig.provider_name,
    provider_model: providerConfig.generation_endpoint || undefined,
    snapshot: snapshot as Record<string, unknown>,
    version: nextVersion,
  });

  if (!generationId) {
    await admin.from("creator_uniform_library").update({
      generation_status: "failed",
      error_message:     "Failed to create generation record",
      updated_at:        now,
    }).eq("creator_id", creatorId).eq("dress_id", dressId);
    return respond({ error: "Failed to create generation record" }, 500);
  }

  let result;
  try {
    result = await imageWorker.execute({ generationId, snapshot, providerConfig });
  } catch (e) {
    const msg = (e as Error).message;
    await admin.from("creator_uniform_library").update({
      generation_status: "failed",
      error_message:     msg,
      updated_at:        now,
    }).eq("creator_id", creatorId).eq("dress_id", dressId);
    return respond({ error: "Dress asset generation failed.", detail: msg, step_failed: 5, dress_code: dress.dress_code }, 500);
  }

  if (result.status !== "completed" || !result.outputUrl) {
    await admin.from("creator_uniform_library").update({
      generation_status: "failed",
      error_message:     result.error ?? "Generation failed",
      updated_at:        now,
    }).eq("creator_id", creatorId).eq("dress_id", dressId);
    return respond({ error: "Dress asset generation failed.", detail: result.error ?? "Generation failed", step_failed: 5, dress_code: dress.dress_code }, 500);
  }

  // ── Step 6: Copy output to uniform-previews bucket ──────────────────────────
  const storagePath = `${creatorId}/${dress.dress_code}`;
  let assetUrl: string;
  try {
    assetUrl = await copyToBucket(result.outputUrl, storagePath, supabaseUrl, serviceKey);
  } catch (e) {
    const msg = (e as Error).message;
    await admin.from("creator_uniform_library").update({
      generation_status: "failed",
      error_message:     msg,
      updated_at:        now,
    }).eq("creator_id", creatorId).eq("dress_id", dressId);
    return respond({ error: "Dress asset storage failed.", detail: msg, step_failed: 6, dress_code: dress.dress_code }, 500);
  }

  // ── Step 7: Persist — canonical catalog + creator record ───────────────────
  await admin.from("ai_dress_library").update({
    image_url:  assetUrl,
    updated_at: now,
  }).eq("id", dressId);

  const { data: finalRecord } = await admin
    .from("creator_uniform_library")
    .update({
      preview_image_url: assetUrl,
      storage_path:      storagePath,
      generation_status: "generated",
      error_message:     null,
      updated_at:        now,
      metadata: {
        generation_technique: "text_to_image",
        dress_code:           dress.dress_code,
        dress_name:           dress.dress_name,
        category:             dress.category,
        garment_type:         dress.garment_type,
        generated_at:         now,
        prompt_preview:       prompt.slice(0, 200),
      },
    })
    .eq("creator_id", creatorId)
    .eq("dress_id", dressId)
    .select()
    .maybeSingle();

  return respond({
    status:            "success",
    dress_code:        dress.dress_code,
    dress_name:        dress.dress_name,
    category:          dress.category,
    garment_type:      dress.garment_type,
    asset_url:         assetUrl,
    version:           nextVersion,
    render_base:       "text_to_image",
    record_id:         finalRecord?.id ?? null,
    canonical_updated: true,
    bucket:            ASSET_BUCKET,
    storage_path:      storagePath,
    generation_id:     generationId,
  });
});
