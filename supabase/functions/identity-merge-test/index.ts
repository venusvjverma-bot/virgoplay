import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createGeneration } from "../_shared/generation-lifecycle.ts";
import { loadProviderConfig } from "../_shared/generation-provider.ts";
import { imageWorker } from "../_shared/image-worker.ts";
import type {
  GenerationSnapshot,
  ProviderConfig,
} from "../_shared/generation-types.ts";

// ── IDENTITY MERGE TEST (Generation Engine V2) ────────────────────────────────
//
// Diagnostic function: face-swap an APR face preset onto each MT-IMG storyboard
// image. Each image is a separate face-swap generation. Results are stored in
// the identity-test-variants bucket and tracked in engine_image_package_variants.
//
// No auth — this is a platform diagnostic tool.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUCKET        = "identity-test-variants";
const MT_CODES      = Array.from({ length: 10 }, (_, i) => `MT-IMG-${String(i + 1).padStart(3, "0")}`);
const DEFAULT_FACE  = "APR-002";
const DEFAULT_BODY  = "BT-003";

// Super admin creator used for platform-level diagnostic generations.
const PLATFORM_CREATOR_ID = "81037345-2a1b-4242-952d-d5087b737c27";

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function storeImage(
  generatedUrl: string,
  variantCode:  string,
  supabaseUrl:  string,
  serviceKey:   string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const imgRes = await fetch(generatedUrl);
  if (!imgRes.ok) throw new Error(`Download failed: ${imgRes.status}`);

  const bytes       = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const ext         = contentType.includes("webp") ? "webp" : contentType.includes("png") ? "png" : "jpg";
  const storagePath = `${variantCode}.${ext}`;

  const admin = createClient(supabaseUrl, serviceKey);
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(storagePath);
  return { publicUrl, storagePath };
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

  let params: {
    face_preset_id?: string;
    body_preset_id?: string;
    package_codes?:  string[];
    force?:          boolean;
  } = {};
  try { params = await req.json(); } catch { /* empty body = run all */ }

  const facePresetId = params.face_preset_id ?? DEFAULT_FACE;
  const bodyPresetId = params.body_preset_id ?? DEFAULT_BODY;
  const targetCodes  = params.package_codes  ?? MT_CODES;

  const admin = createClient(supabaseUrl, serviceKey);

  // ── 1. Fetch face reference image ──────────────────────────────────────────
  const { data: faceAsset, error: faceErr } = await admin
    .from("engine_appearance_preset_assets")
    .select("preset_name, image_url")
    .eq("preset_id", facePresetId)
    .maybeSingle();

  if (faceErr || !faceAsset?.image_url) {
    return respond({ error: `Face preset ${facePresetId} not found or has no image.` }, 422);
  }

  // ── 2. Fetch body reference metadata ──────────────────────────────────────
  const { data: bodyAsset } = await admin
    .from("engine_body_type_preset_assets")
    .select("body_type_name, image_url")
    .eq("preset_id", bodyPresetId)
    .maybeSingle();

  // ── 3. Fetch MT-IMG source images ──────────────────────────────────────────
  const { data: mtRows, error: mtErr } = await admin
    .from("engine_image_packages")
    .select("package_code, image_url")
    .in("package_code", targetCodes)
    .eq("is_active", true)
    .not("image_url", "is", null)
    .order("package_code")
    .order("updated_at", { ascending: false });

  if (mtErr) return respond({ error: mtErr.message }, 500);

  // De-duplicate: keep first occurrence per package_code
  const seen = new Set<string>();
  const mtImages: { package_code: string; image_url: string }[] = [];
  for (const row of (mtRows ?? [])) {
    if (!seen.has(row.package_code) && row.image_url) {
      seen.add(row.package_code);
      mtImages.push({ package_code: row.package_code, image_url: row.image_url });
    }
  }

  const missing = targetCodes.filter(c => !mtImages.some(m => m.package_code === c));
  if (mtImages.length === 0) {
    return respond({
      error: "No generated MT-IMG images found. Generate them first via the Test Companion page.",
      missing,
    }, 422);
  }

  // ── 4. Ensure bucket exists ───────────────────────────────────────────────
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  // ── 5. Process each image sequentially ────────────────────────────────────
  const results: {
    variant_code: string;
    source:       string;
    status:       string;
    image_url?:   string;
    error?:       string;
  }[] = [];

  for (const mt of mtImages) {
    const variantCode = `${mt.package_code}-${facePresetId.replace("-", "")}`;

    // Skip if already complete (unless force=true)
    if (!params.force) {
      const { data: existing } = await admin
        .from("engine_image_package_variants")
        .select("image_url")
        .eq("variant_code", variantCode)
        .maybeSingle();
      if (existing?.image_url) {
        results.push({ variant_code: variantCode, source: mt.package_code, status: "skipped", image_url: existing.image_url });
        continue;
      }
    }

    try {
      // ── Build snapshot: face-swap APR face onto MT-IMG scene ───────────────
      // Worker detects faceImageUrl + bodyImageUrl → routes to adapter.faceSwap().
      // Here bodyImageUrl is the MT-IMG scene (the base image receiving the face).
      const snapshot: GenerationSnapshot = {
        prompt: "Face swap: APR identity face onto MT-IMG storyboard scene.",
        inputAssets: {
          faceImageUrl: faceAsset.image_url,
          bodyImageUrl:  mt.image_url,
        },
        providerMetadata: {
          variant_code:        variantCode,
          source_package_code: mt.package_code,
          face_preset_id:      facePresetId,
          body_preset_id:      bodyPresetId,
          composition_technique: "face_swap",
        },
      };

      const generationId = await createGeneration(admin, {
        creator_id: PLATFORM_CREATOR_ID,
        asset_type: "face_swap",
        asset_subtype: "storyboard_image",
        business_ref_type: "engine_image_package_variants",
        provider_id: providerConfig.id,
        provider_name: providerConfig.provider_name,
        provider_model: providerConfig.generation_endpoint || undefined,
        snapshot: snapshot as Record<string, unknown>,
      });

      if (!generationId) throw new Error("Failed to create generation record");

      const result = await imageWorker.execute({ generationId, snapshot, providerConfig });

      if (result.status !== "completed" || !result.outputUrl) {
        throw new Error(result.error ?? "Generation failed");
      }

      // Copy from generation-outputs to identity-test-variants bucket
      const stored = await storeImage(result.outputUrl, variantCode, supabaseUrl, serviceKey);

      await admin.from("engine_image_package_variants").upsert({
        variant_code:        variantCode,
        source_package_code: mt.package_code,
        face_preset_id:      facePresetId,
        body_preset_id:      bodyPresetId,
        image_url:           stored.publicUrl,
        storage_path:        stored.storagePath,
        is_generated:        true,
        error_message:       null,
        updated_at:          new Date().toISOString(),
      }, { onConflict: "variant_code" });

      results.push({ variant_code: variantCode, source: mt.package_code, status: "generated", image_url: stored.publicUrl });
    } catch (e) {
      const msg = (e as Error).message;
      await admin.from("engine_image_package_variants").upsert({
        variant_code:        variantCode,
        source_package_code: mt.package_code,
        face_preset_id:      facePresetId,
        body_preset_id:      bodyPresetId,
        is_generated:        false,
        error_message:       msg,
        updated_at:          new Date().toISOString(),
      }, { onConflict: "variant_code" });

      results.push({ variant_code: variantCode, source: mt.package_code, status: "error", error: msg });
    }
  }

  const succeeded = results.filter(r => r.status === "generated").length;
  const skipped   = results.filter(r => r.status === "skipped").length;
  const failed    = results.filter(r => r.status === "error").length;

  return respond({
    experiment:      "identity-to-body-merge",
    face_preset:     facePresetId,
    face_name:       faceAsset.preset_name,
    body_preset:     bodyPresetId,
    body_name:       bodyAsset?.body_type_name ?? bodyPresetId,
    total_requested: targetCodes.length,
    available:       mtImages.length,
    missing,
    succeeded,
    skipped,
    failed,
    results,
  });
});
