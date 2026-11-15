import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createGeneration } from "../_shared/generation-lifecycle.ts";
import { loadProviderConfig } from "../_shared/generation-provider.ts";
import { imageWorker } from "../_shared/image-worker.ts";
import type {
  GenerationSnapshot,
  ProviderConfig,
} from "../_shared/generation-types.ts";

// ── APPEARANCE PREVIEW GENERATION PIPELINE (Generation Engine V2) ─────────────
//
// Generates a single AI model appearance preset preview image.
// Admin-only: requires is_admin or is_super_admin on the caller's profile.
//
// The generated image is stored in the appearance-presets bucket and the
// engine_appearance_preset_assets record is updated with the URL.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUCKET = "appearance-presets";

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function storePreset(
  generatedUrl: string,
  presetId:     string,
  supabaseUrl:  string,
  serviceKey:   string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const imgRes = await fetch(generatedUrl);
  if (!imgRes.ok) throw new Error(`Failed to download generated image: ${imgRes.status}`);

  const bytes       = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const ext         = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const storagePath = `${presetId}/preview.${ext}`;

  const adminDb = createClient(supabaseUrl, serviceKey);
  const { error } = await adminDb.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: { publicUrl } } = adminDb.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return { publicUrl, storagePath };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const v = {
    auth_verified:             false,
    admin_verified:            false,
    prompt_ready:              false,
    image_generation_called:   false,
    ai_image_generated:        false,
    image_stored_successfully: false,
    preset_record_updated:     false,
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Verify caller is authenticated ────────────────────────────────────────
    const userDb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userDb.auth.getUser();
    if (authErr || !user) return respond({ error: "Unauthorized" }, 401);
    v.auth_verified = true;

    // ── Verify caller is admin ────────────────────────────────────────────────
    const adminDb = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await adminDb
      .from("creator_profiles")
      .select("is_admin, is_super_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_admin && !profile?.is_super_admin) {
      return respond({ error: "Admin access required to generate appearance presets." }, 403);
    }
    v.admin_verified = true;

    // ── Parse request ─────────────────────────────────────────────────────────
    const { preset_id, force = false } =
      await req.json() as { preset_id?: string; force?: boolean };

    if (!preset_id) {
      return respond({ error: "preset_id is required (e.g. 'APR-001' through 'APR-007')." }, 400);
    }

    // ── Load preset from DB ───────────────────────────────────────────────────
    const { data: preset, error: presetErr } = await adminDb
      .from("engine_appearance_preset_assets")
      .select("preset_id, preset_name, generation_prompt, is_generated, image_url")
      .eq("preset_id", preset_id)
      .single();

    if (presetErr || !preset) {
      return respond({ error: `Unknown preset_id: ${preset_id}` }, 400);
    }

    if (!preset.generation_prompt) {
      return respond({
        error: `${preset_id} (${preset.preset_name}) has no generation prompt — it uses a creator-uploaded reference instead.`,
        verification: v,
      }, 400);
    }

    // ── Skip if already generated (unless force=true) ─────────────────────────
    if (!force && preset.is_generated && preset.image_url) {
      return respond({
        preset_id,
        image_url:      preset.image_url,
        already_exists: true,
        verification:   { ...v, prompt_ready: true, image_generation_called: true, ai_image_generated: true, image_stored_successfully: true, preset_record_updated: true },
      });
    }

    v.prompt_ready = true;

    // ── Resolve provider config via the Generation Engine loader ──────────────
    const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
    if (!providerConfig) {
      return respond({
        error: "No image provider configured. Add one in the Provider Configuration page.",
        hint:  "Once a provider is configured, call this function with { preset_id: 'APR-001' } to generate each preset.",
        verification: v,
      }, 422);
    }

    // ── Build immutable Generation Snapshot ───────────────────────────────────
    const snapshot: GenerationSnapshot = {
      prompt: preset.generation_prompt,
      providerMetadata: {
        preset_id:   preset.preset_id,
        preset_name: preset.preset_name,
      },
    };

    // ── Create Generation record ──────────────────────────────────────────────
    const generationId = await createGeneration(adminDb, {
      creator_id: user.id,
      asset_type: "image",
      asset_subtype: "appearance_preset",
      business_ref_type: "engine_appearance_preset_assets",
      provider_id: providerConfig.id,
      provider_name: providerConfig.provider_name,
      provider_model: providerConfig.generation_endpoint || undefined,
      snapshot: snapshot as Record<string, unknown>,
    });

    if (!generationId) throw new Error("Failed to create generation record");

    // ── Hand execution to the image worker ─────────────────────────────────────
    v.image_generation_called = true;
    const result = await imageWorker.execute({
      generationId,
      snapshot,
      providerConfig,
    });

    if (result.status !== "completed" || !result.outputUrl) {
      throw new Error(result.error ?? "Generation failed");
    }
    v.ai_image_generated = true;

    // ── Store to appearance-presets bucket ─────────────────────────────────────
    const stored = await storePreset(result.outputUrl, preset_id, supabaseUrl, serviceKey);
    v.image_stored_successfully = true;

    // ── Update DB ─────────────────────────────────────────────────────────────
    const { error: updateErr } = await adminDb
      .from("engine_appearance_preset_assets")
      .update({
        image_url:    stored.publicUrl,
        storage_path: stored.storagePath,
        is_generated: true,
        updated_at:   new Date().toISOString(),
      })
      .eq("preset_id", preset_id);

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);
    v.preset_record_updated = true;

    return respond({
      preset_id,
      preset_name:    preset.preset_name,
      image_url:      stored.publicUrl,
      already_exists: false,
      verification:   v,
      generation_id:  generationId,
    });

  } catch (e) {
    return respond({ error: (e as Error).message, verification: v }, 500);
  }
});
