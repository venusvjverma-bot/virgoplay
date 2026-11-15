import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createGeneration } from "../_shared/generation-lifecycle.ts";
import { loadProviderConfig } from "../_shared/generation-provider.ts";
import { imageWorker } from "../_shared/image-worker.ts";
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

// ── Scene Image Generation (image_editor with 2 reference images) ──────────────
//
// Input: scene_production_id (a scene_image_productions row that has already
// been saved with prompt + generation config + reference URLs). The function:
//   1. Loads the scene_image_productions row (must belong to the authed creator)
//   2. Resolves the two reference image URLs:
//        - identity_image_url (Character Studio V2 character)
//        - role_image_url (Role Image)
//   3. Builds a GenerationSnapshot with renderTechnique = "image_editor" and
//      inputAssets.imageAssets = [identityImageUrl, roleImageUrl]
//   4. Creates a Generation record and executes the image worker
//   5. Updates the scene_image_productions row with the generated image URL,
//      asset ID, and status

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

    // ── Parse request ──────────────────────────────────────────────────────
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

    // ── Resolve reference images ──────────────────────────────────────────
    // Always resolve the identity image from the creator's CURRENT selected
    // character (Character Studio V2) so that switching characters updates
    // all scenes — including Scene 1, which may have a stale cached URL from
    // a previous character. The role image is resolved from the row's cached
    // value first, then from the child's own role image production.
    let roleImageUrl: string | null = sceneProd.role_image_url ?? null;
    let roleAssetId: string | null = sceneProd.role_image_asset_id ?? null;

    // Always resolve identity from current selection — never trust the cached
    // value on the scene row, which may point to a previously selected character.
    // For Child Creators, the selected identity image may live in their own
    // override row (character_studio_v2_my_ai_overrides.selected_image_url)
    // rather than the shared character_studio_v2.identity_image_url.
    let identityImageUrl: string | null = null;
    let identityAssetId: string | null = null;
    {
      const { data: selChar } = await admin
        .from("character_studio_v2_selections")
        .select("character_id, character:character_studio_v2 ( identity_image_url, identity_asset_id, is_customize_ai )")
        .eq("creator_id", creatorId)
        .maybeSingle();
      const char = selChar?.character as unknown as
        { identity_image_url: string | null; identity_asset_id: string | null; is_customize_ai: boolean | null } | null;

      if (char?.is_customize_ai) {
        // Customize AI: each creator has their own image in customize_ai_overrides.
        // Never use the shared row's identity_image_url (the Mother's).
        const { data: customizeOverride } = await admin
          .from("customize_ai_overrides")
          .select("selected_image_url, generated_image_url")
          .eq("creator_id", creatorId)
          .eq("character_id", selChar!.character_id)
          .maybeSingle();
        identityImageUrl = customizeOverride?.selected_image_url ?? customizeOverride?.generated_image_url ?? null;
        identityAssetId = identityImageUrl;
      } else if (char?.identity_image_url) {
        identityImageUrl = char.identity_image_url;
        identityAssetId = char.identity_asset_id ?? null;
      }
    }

    // Fall back to the Child Creator's own My AI override when the shared
    // character has no identity image (common for My AI characters whose
    // image is generated per-child rather than by the Mother Creator).
    if (!identityImageUrl) {
      const { data: override } = await admin
        .from("character_studio_v2_my_ai_overrides")
        .select("selected_image_url")
        .eq("creator_id", creatorId)
        .maybeSingle();
      if (override?.selected_image_url) {
        identityImageUrl = override.selected_image_url;
        identityAssetId = override.selected_image_url;
      }
    }

    if (!roleImageUrl) {
      // Resolve from the child's own role image production for this role
      const { data: roleProd } = await admin
        .from("role_image_productions")
        .select("role_image_url, role_image_asset_id")
        .eq("creator_id", creatorId)
        .eq("role_id", sceneProd.role_id)
        .maybeSingle();
      if (roleProd?.role_image_url) {
        roleImageUrl = roleProd.role_image_url;
        roleAssetId = roleProd.role_image_asset_id ?? null;
      }
    }

    if (!identityImageUrl) {
      return respond({
        error: "The selected character has no identity image URL. Select a character with an identity image in Character Studio V2.",
      }, 422);
    }
    if (!roleImageUrl) {
      return respond({
        error: "The selected role has no role image URL. Generate and save a Role Image first.",
      }, 422);
    }

    const prompt: string = sceneProd.prompt || "";
    if (!prompt.trim()) {
      return respond({ error: "Scene prompt is empty. Save a prompt before generating." }, 422);
    }

    const model: string = sceneProd.gen_model || "FLUX_KLEIN_NSFW";
    const ratio: string = sceneProd.gen_ratio || "9:16";
    const batchSize: number = Math.max(1, sceneProd.gen_number_of_images || 1);

    // ── Resolve provider ────────────────────────────────────────────────────
    const providerConfig: ProviderConfig | null = await loadProviderConfig("image");
    if (!providerConfig) {
      return respond({ error: "No active image provider configured. Add one on the Provider Configuration page." }, 422);
    }

    // ── Build the Generation Snapshot ───────────────────────────────────────
    // When the active provider is Hugging Face, pass the HF-specific params
    // (lora_adapter, seed, randomize_seed, guidance_scale, steps) from the
    // scene_image_productions row into the snapshot so the HF adapter receives
    // the exact payload configured in the UI.
    // When the active provider is Atlas Cloud, pass the Atlas-specific params
    // (atlas_size, atlas_output_format, atlas_thinking, atlas_prompt_optimization_mode)
    // from the scene_image_productions row so the Atlas adapter builds the
    // correct Seedream v5.0 Pro Edit payload.
    const isHuggingFace = providerConfig.provider_name.toLowerCase().includes("hugging");
    const isAtlasCloud = providerConfig.provider_name.toLowerCase().includes("atlas");
    const hfParams: Record<string, unknown> = {};
    if (isHuggingFace) {
      if (typeof sceneProd.lora_adapter === "string") hfParams.lora_adapter = sceneProd.lora_adapter;
      if (typeof sceneProd.seed === "number") hfParams.seed = sceneProd.seed;
      if (typeof sceneProd.randomize_seed === "boolean") hfParams.randomize_seed = sceneProd.randomize_seed;
      if (typeof sceneProd.guidance_scale === "number") hfParams.guidance_scale = sceneProd.guidance_scale;
      if (typeof sceneProd.steps === "number") hfParams.steps = sceneProd.steps;
    }
    const atlasParams: Record<string, unknown> = {};
    if (isAtlasCloud) {
      if (typeof sceneProd.gen_ratio === "string") atlasParams.atlas_size = sceneProd.gen_ratio;
      if (typeof sceneProd.gen_output_format === "string") atlasParams.atlas_output_format = sceneProd.gen_output_format;
      if (typeof sceneProd.gen_thinking === "string") atlasParams.atlas_thinking = sceneProd.gen_thinking;
      if (typeof sceneProd.gen_prompt_optimization_mode === "string") atlasParams.atlas_prompt_optimization_mode = sceneProd.gen_prompt_optimization_mode;
    }

    const snapshot: GenerationSnapshot = {
      prompt,
      renderTechnique: "image_editor",
      inputAssets: {
        imageAssets: [identityImageUrl, roleImageUrl],
      },
      providerParameters: {
        model,
        ratio,
        batch_size: batchSize,
        ...hfParams,
        ...atlasParams,
      },
      providerMetadata: {
        scene_production_id: sceneProductionId,
        role_id: sceneProd.role_id,
        scene_id: sceneProd.scene_id,
        gen_tool: sceneProd.gen_tool || "image_editor",
      },
    };

    // ── Create Generation record ────────────────────────────────────────────
    const generationId = await createGeneration(admin, {
      creator_id: creatorId,
      asset_type: "image",
      asset_subtype: "scene",
      business_ref_type: "scene_image_productions",
      business_ref_id: sceneProductionId,
      provider_id: providerConfig.id,
      provider_name: providerConfig.provider_name,
      provider_model: providerConfig.generation_endpoint || undefined,
      snapshot: snapshot as Record<string, unknown>,
      version: 1,
    });

    if (!generationId) {
      return respond({ error: "Failed to create generation record" }, 500);
    }

    // ── Persist resolved reference images on the child's row ───────────────
    // Only write identity/role fields — never touch recipe fields. This caches
    // the child's own reference images so future regenerations skip the
    // lookup. Uses the service-role client which bypasses RLS, but the row
    // was already verified as belonging to creatorId above.
    if (sceneProd.identity_image_url !== identityImageUrl || sceneProd.role_image_url !== roleImageUrl) {
      await admin.from("scene_image_productions").update({
        identity_image_url: identityImageUrl,
        identity_asset_id: identityAssetId,
        role_image_url: roleImageUrl,
        role_image_asset_id: roleAssetId,
        updated_at: new Date().toISOString(),
      }).eq("id", sceneProductionId);
    }

    // ── Mark scene as Processing ──────────────────────────────────────────────
    await admin.from("scene_image_productions").update({
      scene_image_status: "Processing",
      scene_image_generation_id: generationId,
      updated_at: new Date().toISOString(),
    }).eq("id", sceneProductionId);

    // ── Execute the image worker ─────────────────────────────────────────────
    let result;
    try {
      result = await imageWorker.execute({ generationId, snapshot, providerConfig });
    } catch (e) {
      const msg = (e as Error).message;
      await admin.from("scene_image_productions").update({
        scene_image_status: "Failed",
        updated_at: new Date().toISOString(),
      }).eq("id", sceneProductionId);
      return respond({ error: "Image generation failed.", detail: msg, generation_id: generationId }, 500);
    }

    if (result.status !== "completed" || !result.outputUrl) {
      await admin.from("scene_image_productions").update({
        scene_image_status: "Failed",
        updated_at: new Date().toISOString(),
      }).eq("id", sceneProductionId);
      return respond({
        error: "Image generation failed.",
        detail: result.error ?? "Generation failed",
        generation_id: generationId,
      }, 500);
    }

    // ── Update scene with generated image ─────────────────────────────────────
    const assetId = (result.outputMetadata?.asset_ids as string[] | undefined)?.[0] ?? null;

    await admin.from("scene_image_productions").update({
      scene_image_url: result.outputUrl,
      scene_image_asset_id: assetId,
      scene_image_status: "Ready",
      updated_at: new Date().toISOString(),
    }).eq("id", sceneProductionId);

    return respond({
      success: true,
      image_url: result.outputUrl,
      asset_id: assetId,
      generation_id: generationId,
      status: "Ready",
    });
  } catch (err) {
    return respond({ error: (err as Error).message }, 500);
  }
});
