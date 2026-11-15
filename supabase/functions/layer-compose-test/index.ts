import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createGeneration } from "../_shared/generation-lifecycle.ts";
import { loadProviderConfig } from "../_shared/generation-provider.ts";
import { imageWorker } from "../_shared/image-worker.ts";
import type {
  GenerationSnapshot,
  ProviderConfig,
} from "../_shared/generation-types.ts";

// ── LAYER COMPOSE TEST (Generation Engine V2) ──────────────────────────────────
//
// Diagnostic function: virtual try-on (cat-vton) — apply a dress garment asset
// onto a pre-composed AI identity figure. The worker detects
// inputAssets.garmentImageUrl + inputAssets.referenceImageUrl and routes to
// adapter.virtualTryOn() automatically.
//
// No auth — this is a platform diagnostic tool.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUCKET = "layer-compose-tests";

// Super admin creator used for platform-level diagnostic generations.
const PLATFORM_CREATOR_ID = "81037345-2a1b-4242-952d-d5087b737c27";

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function storeImage(
  sourceUrl:   string,
  storagePath: string,
  supabaseUrl: string,
  serviceKey:  string,
): Promise<string> {
  const imgRes = await fetch(sourceUrl);
  if (!imgRes.ok) throw new Error(`Image download failed (${imgRes.status}): ${sourceUrl}`);

  const bytes = await imgRes.arrayBuffer();
  const ct    = imgRes.headers.get("content-type") ?? "image/jpeg";
  const ext   = ct.includes("webp") ? "webp" : ct.includes("png") ? "png" : "jpg";
  const path  = `${storagePath}.${ext}`;

  const admin = createClient(supabaseUrl, serviceKey);
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: ct, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path);
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
  let dressCode    = "DR-MT-001";
  try {
    const body = await req.json();
    if (body.identity_code) identityCode = body.identity_code;
    if (body.dress_code)    dressCode    = body.dress_code;
  } catch { /* use defaults */ }

  const admin = createClient(supabaseUrl, serviceKey);

  // ── Step 1: Load Master AI Identity ──────────────────────────────────────────
  const { data: identity, error: idErr } = await admin
    .from("master_ai_identities")
    .select("id, identity_code, apr_code, apr_name, bt_code, bt_name, generation_status, composed_preview_url")
    .eq("identity_code", identityCode)
    .maybeSingle();

  if (idErr || !identity) {
    return respond({ error: `Master AI Identity ${identityCode} not found.`, step_failed: 1 }, 404);
  }
  if (identity.generation_status !== "completed") {
    return respond({
      error:       `Identity ${identityCode} is not completed (status: ${identity.generation_status}).`,
      step_failed: 1,
    }, 422);
  }
  if (!identity.composed_preview_url) {
    return respond({
      error:       `Identity ${identityCode} has no composed_preview_url. Generate the identity first.`,
      step_failed: 1,
    }, 422);
  }

  // ── Step 2: Load Dress asset ──────────────────────────────────────────────────
  const { data: dress } = await admin
    .from("ai_dress_library")
    .select("id, dress_code, dress_name, image_url, description, generation_prompt_fragment")
    .eq("dress_code", dressCode)
    .eq("is_active", true)
    .maybeSingle();

  if (!dress?.image_url) {
    return respond({
      error:       `Dress ${dressCode} not found, inactive, or has no image_url.`,
      step_failed: 2,
      resolution:  `Generate the dress image via Uniform Library → ${dressCode} before running this test.`,
    }, 422);
  }

  // ── Step 3: Build immutable Generation Snapshot ──────────────────────────────
  // Worker detects garmentImageUrl + referenceImageUrl → routes to adapter.virtualTryOn().
  // referenceImageUrl = AI identity composed figure (canonical human, face visible)
  // garmentImageUrl   = DR dress asset (mannequin-only clothing reference)
  const snapshot: GenerationSnapshot = {
    prompt: "Virtual try-on: apply dress garment onto composed AI identity figure.",
    inputAssets: {
      referenceImageUrl: identity.composed_preview_url,
      garmentImageUrl:    dress.image_url,
    },
    identityContext: {
      identityId:   identity.id,
      identityCode: identity.identity_code,
      aprCode:      identity.apr_code,
      aprName:      identity.apr_name,
      btCode:       identity.bt_code,
      btName:       identity.bt_name,
    },
    dressContext: {
      dressId:   dress.id,
      dressCode: dress.dress_code,
      dressName: dress.dress_name,
      dressDescription: dress.description ?? undefined,
      dressPromptFragment: dress.generation_prompt_fragment ?? undefined,
    },
    providerMetadata: {
      identity_code: identityCode,
      dress_code:    dressCode,
      composition_technique: "virtual_try_on",
      cloth_type:    "overall",
    },
  };

  // ── Step 4: Create Generation record ─────────────────────────────────────────
  const generationId = await createGeneration(admin, {
    creator_id: PLATFORM_CREATOR_ID,
    asset_type: "image",
    asset_subtype: "scene",
    business_ref_type: "master_ai_identities",
    business_ref_id: identity.id,
    provider_id: providerConfig.id,
    provider_name: providerConfig.provider_name,
    provider_model: providerConfig.generation_endpoint || undefined,
    snapshot: snapshot as Record<string, unknown>,
  });

  if (!generationId) {
    return respond({ error: "Failed to create generation record" }, 500);
  }

  // ── Step 5: Execute image worker (virtual try-on) ─────────────────────────────
  let previewUrl: string;
  try {
    const result = await imageWorker.execute({ generationId, snapshot, providerConfig });

    if (result.status !== "completed" || !result.outputUrl) {
      throw new Error(result.error ?? "Generation failed");
    }

    // Copy from generation-outputs to layer-compose-tests bucket
    const storagePath = `${identityCode}/${dressCode}/${Date.now()}-compose`;
    previewUrl = await storeImage(result.outputUrl, storagePath, supabaseUrl, serviceKey);
  } catch (e) {
    const msg = (e as Error).message;
    return respond({
      error:        "Virtual try-on failed.",
      detail:       msg,
      step_failed:  5,
      identity_code: identityCode,
      dress_code:   dressCode,
      diagnosis:    "Unexpected error from image provider. Verify the provider configuration and that both source images are accessible.",
    }, 500);
  }

  // ── Step 6: Return structured result ──────────────────────────────────────────
  return respond({
    status: "success",

    preview_url: previewUrl,

    pipeline: {
      step_1_identity: {
        code:                identityCode,
        apr_code:            identity.apr_code,
        apr_name:            identity.apr_name,
        bt_code:             identity.bt_code,
        bt_name:             identity.bt_name,
        composed_preview_url: identity.composed_preview_url,
        note:                "Pre-existing composed identity used directly — no re-generation.",
      },
      step_2_dress: {
        code:        dress.dress_code,
        name:        dress.dress_name,
        description: dress.description,
        image_url:   dress.image_url,
        note:        "Mannequin-only clothing asset. Read-only reference — not modified.",
      },
      step_3_try_on: {
        technique:      "virtual_try_on",
        human_image:    identity.composed_preview_url,
        garment_image:  dress.image_url,
      },
      step_4_storage: {
        bucket:       BUCKET,
        storage_path: `${identityCode}/${dressCode}`,
        public_url:   previewUrl,
      },
    },

    generation_id: generationId,

    integrity: {
      identity_modified:    false,
      dress_asset_modified: false,
      note: "Both source assets are read-only. Only this temporary preview was written.",
    },
  });
});
