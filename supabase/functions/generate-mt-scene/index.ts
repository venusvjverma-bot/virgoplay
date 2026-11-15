import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createGeneration } from "../_shared/generation-lifecycle.ts";
import { loadProviderConfig } from "../_shared/generation-provider.ts";
import { imageWorker } from "../_shared/image-worker.ts";
import type {
  GenerationSnapshot,
  ProviderConfig,
} from "../_shared/generation-types.ts";

// ── MT SCENE GENERATION (Generation Engine V2) ───────────────────────────────
//
// Two-stage pipeline: text-to-image → face-swap identity lock.
// The worker handles both stages natively when renderTechnique is set to
// "identity_lock_pipeline" and inputAssets.faceImageUrl is provided.
//
// Business logic (identity lookup, dress metadata, role_image_library upsert)
// remains in this function. The worker is stateless and only executes the
// provider call + stores output to generation-outputs bucket.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ROLE_IMAGE_BUCKET = "role-image-library";

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SCENE_PROMPTS: Record<string, string> = {
  "MT-IMG-001": [
    "Full-length professional portrait photograph,",
    "complete figure visible from top of head down to feet,",
    "entire body in frame including legs and feet on floor,",
    "wide enough composition to show the complete standing figure.",
    "Beautiful young woman, fair complexion, warm skin tone,",
    "dark brown wavy hair past shoulders, curvy feminine figure.",
    "Wearing luxury spa wrap robe: warm beige premium cotton terry fabric,",
    "wide spa collar, deep V neckline, self-tie belt fastened at waist,",
    "two large front patch pockets, short sleeves, robe ends above the knee,",
    "soft matte fabric texture, relaxed luxurious fit, natural draping.",
    "Standing naturally, slight weight shift to one leg,",
    "relaxed shoulders, both hands gently tucked in robe pockets,",
    "warm genuine welcoming smile, direct friendly eye contact.",
    "Background: luxury wellness spa reception,",
    "wooden reception counter behind subject, white orchid arrangement,",
    "neatly folded white towels, lit pillar candles,",
    "warm-lit product shelving, warm amber and cream color palette,",
    "softly blurred bokeh, high-end spa atmosphere.",
    "Straight-on frontal angle, camera at chest height,",
    "subject centered in frame, comfortable negative space on all sides,",
    "vertical portrait orientation.",
    "Warm soft diffused indoor luxury lighting, natural skin tones,",
    "gentle shadows, premium commercial spa photography,",
    "high-end luxury wellness branding, photorealistic.",
  ].join(" "),
};

async function storeImage(
  sourceUrl:   string,
  storagePath: string,
  supabaseUrl: string,
  serviceKey:  string,
): Promise<string> {
  const imgRes = await fetch(sourceUrl);
  if (!imgRes.ok) throw new Error(`Image download failed (${imgRes.status})`);

  const bytes = await imgRes.arrayBuffer();
  const ct    = imgRes.headers.get("content-type") ?? "image/jpeg";
  const ext   = ct.includes("webp") ? "webp" : ct.includes("png") ? "png" : "jpg";
  const path  = `${storagePath}.${ext}`;

  const admin = createClient(supabaseUrl, serviceKey);
  await admin.storage.createBucket(ROLE_IMAGE_BUCKET, { public: true }).catch(() => {});

  const { error } = await admin.storage
    .from(ROLE_IMAGE_BUCKET)
    .upload(path, bytes, { contentType: ct, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: { publicUrl } } = admin.storage.from(ROLE_IMAGE_BUCKET).getPublicUrl(path);
  return publicUrl;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Resolve provider config via the Generation Engine loader ──────────────
  const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
  if (!providerConfig) {
    return respond({ error: "No image provider configured. Add one in the Provider Configuration page." }, 422);
  }

  let identityCode = "AI-0009";
  let imageCode    = "MT-IMG-001";
  try {
    const body = await req.json();
    if (body.identity_code) identityCode = body.identity_code;
    if (body.image_code)    imageCode    = body.image_code;
  } catch { /* use defaults */ }

  const scenePrompt = SCENE_PROMPTS[imageCode];
  if (!scenePrompt) {
    return respond({ error: `No scene prompt defined for image_code: ${imageCode}.`, step_failed: 0 }, 422);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // ── Step 1: Load Master AI Identity ──────────────────────────────────────────
  const { data: identity } = await admin
    .from("master_ai_identities")
    .select("id, identity_code, creator_id, apr_code, apr_name, bt_code, bt_name, generation_status")
    .eq("identity_code", identityCode)
    .maybeSingle();

  if (!identity) {
    return respond({ error: `Master AI Identity ${identityCode} not found.`, step_failed: 1 }, 404);
  }
  if (identity.generation_status !== "completed") {
    return respond({
      error:       `Identity ${identityCode} is not completed (status: ${identity.generation_status}).`,
      step_failed: 1,
    }, 422);
  }

  // ── Step 2: Load APR face image ───────────────────────────────────────────────
  const { data: faceAsset } = await admin
    .from("engine_appearance_preset_assets")
    .select("preset_id, preset_name, image_url")
    .eq("preset_id", identity.apr_code)
    .maybeSingle();

  if (!faceAsset?.image_url) {
    return respond({ error: `APR preset ${identity.apr_code} has no image.`, step_failed: 2 }, 422);
  }

  // ── Step 3: Load dress asset (for metadata) ───────────────────────────────────
  const { data: existingRecord } = await admin
    .from("role_image_library")
    .select("id, role_code, version, phase, sequence")
    .eq("creator_id", identity.creator_id)
    .eq("image_code", imageCode)
    .maybeSingle();

  const derivedRoleCode = (() => {
    const prefix = imageCode.split("-IMG-")[0];
    return `${prefix}-001`;
  })();
  const resolvedRoleCode = existingRecord?.role_code ?? derivedRoleCode;

  const { data: roleBlueprint } = await admin
    .from("ai_role_blueprints")
    .select("role_code, role_name, dress_code")
    .eq("role_code", resolvedRoleCode)
    .eq("is_active", true)
    .maybeSingle();

  const dressCode = roleBlueprint?.dress_code ?? "DR-MT-001";

  const { data: dress } = await admin
    .from("ai_dress_library")
    .select("dress_code, dress_name, description")
    .eq("dress_code", dressCode)
    .maybeSingle();

  // ── Step 4: Build immutable Generation Snapshot ──────────────────────────────
  // The worker detects renderTechnique="identity_lock_pipeline" + faceImageUrl
  // and runs the two-stage pipeline automatically.
  const snapshot: GenerationSnapshot = {
    prompt: scenePrompt,
    renderTechnique: "identity_lock_pipeline",
    inputAssets: {
      faceImageUrl: faceAsset.image_url,
    },
    identityContext: {
      identityId:   identity.id,
      identityCode: identity.identity_code,
      aprCode:      identity.apr_code,
      aprName:      identity.apr_name,
      btCode:       identity.bt_code,
      btName:       identity.bt_name,
    },
    providerParameters: {
      imageSize: { width: 768, height: 1280 },
    },
    providerMetadata: {
      identity_code: identityCode,
      image_code:    imageCode,
      role_code:     resolvedRoleCode,
      dress_code:    dressCode,
    },
  };

  // ── Step 5: Create Generation record ─────────────────────────────────────────
  const generationId = await createGeneration(admin, {
    creator_id: identity.creator_id,
    asset_type: "image",
    asset_subtype: "scene",
    business_ref_type: "role_image_library",
    business_ref_id: existingRecord?.id,
    provider_id: providerConfig.id,
    provider_name: providerConfig.provider_name,
    provider_model: providerConfig.generation_endpoint || undefined,
    snapshot: snapshot as Record<string, unknown>,
    version: existingRecord ? existingRecord.version + 1 : 1,
  });

  if (!generationId) {
    return respond({ error: "Failed to create generation record" }, 500);
  }

  // ── Step 6: Execute image worker (two-stage pipeline) ────────────────────────
  let workerOutputUrl: string;
  try {
    const result = await imageWorker.execute({ generationId, snapshot, providerConfig });

    if (result.status !== "completed" || !result.outputUrl) {
      throw new Error(result.error ?? "Generation failed");
    }
    workerOutputUrl = result.outputUrl;
  } catch (e) {
    const msg = (e as Error).message;
    return respond({
      error:        "Scene generation failed.",
      detail:       msg,
      step_failed:  6,
      identity_code: identityCode,
      image_code:   imageCode,
      diagnosis: msg.includes("No face found") || msg.includes("face-swap")
        ? "Generated scene has no detectable face. Try regenerating."
        : "Unexpected error from image provider.",
    }, 500);
  }

  // ── Step 7: Copy output to role-image-library bucket ──────────────────────────
  const storagePath = `${identity.creator_id}/${resolvedRoleCode}/${imageCode}`;
  let publicUrl: string;
  try {
    publicUrl = await storeImage(workerOutputUrl, storagePath, supabaseUrl, serviceKey);
  } catch (e) {
    return respond({
      error:        "Storage failed after successful generation.",
      detail:       (e as Error).message,
      step_failed:  7,
      worker_url:   workerOutputUrl,
    }, 500);
  }

  // ── Step 8: Upsert role_image_library ─────────────────────────────────────────
  const now = new Date().toISOString();
  const metadata = {
    identity_code:        identityCode,
    apr_code:             identity.apr_code,
    apr_name:             identity.apr_name,
    bt_code:              identity.bt_code,
    bt_name:              identity.bt_name,
    dress_code:           dressCode,
    dress_name:           dress?.dress_name ?? dressCode,
    role_code:            resolvedRoleCode,
    generation_technique: "identity_lock_pipeline",
    generated_at:         now,
    scene_spec: {
      camera:      "chest height, straight-on, full body portrait",
      pose:         "standing, weight shift, hands in pockets, welcoming smile",
      environment: "luxury spa reception",
      lighting:    "warm soft ambient",
      aspect:      "768x1280",
    },
  };

  let dbResult;
  if (existingRecord) {
    const { data, error } = await admin
      .from("role_image_library")
      .update({
        image_url:             publicUrl,
        generation_status:     "generated",
        master_ai_identity_id: identity.id,
        version:               existingRecord.version + 1,
        metadata,
        updated_at:            now,
      })
      .eq("id", existingRecord.id)
      .select("id, image_code, version, generation_status")
      .single();
    if (error) return respond({ error: `DB update failed: ${error.message}`, step_failed: 8 }, 500);
    dbResult = data;
  } else {
    const seqNum = parseInt(imageCode.split("-IMG-")[1], 10) || 1;
    const phase  = seqNum <= 3 ? "beginning" : seqNum <= 6 ? "middle" : "ending";
    const { data, error } = await admin
      .from("role_image_library")
      .insert({
        creator_id:            identity.creator_id,
        image_code:            imageCode,
        role_code:             resolvedRoleCode,
        phase,
        sequence:              seqNum,
        version:               1,
        image_url:             publicUrl,
        generation_status:     "generated",
        master_ai_identity_id: identity.id,
        metadata,
      })
      .select("id, image_code, version, generation_status")
      .single();
    if (error) return respond({ error: `DB insert failed: ${error.message}`, step_failed: 8 }, 500);
    dbResult = data;
  }

  return respond({
    status: "success",
    image_url: publicUrl,
    record: {
      id:                dbResult.id,
      image_code:        dbResult.image_code,
      version:           dbResult.version,
      generation_status: dbResult.generation_status,
    },
    pipeline: {
      identity: { code: identityCode, apr_code: identity.apr_code, apr_name: identity.apr_name },
      dress:    { code: dressCode, name: dress?.dress_name ?? dressCode },
      storage:  { bucket: ROLE_IMAGE_BUCKET, path: storagePath, public_url: publicUrl },
    },
    generation_id: generationId,
    integrity: {
      source_identity_modified: false,
      source_dress_modified:    false,
      note: "AI identity face locked via face-swap. Source assets are read-only.",
    },
  });
});
